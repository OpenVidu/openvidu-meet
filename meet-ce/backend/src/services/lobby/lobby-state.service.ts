import { MeetLobbyStatus } from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import ms from 'ms';
import { INTERNAL_CONFIG } from '../../config/internal-config.js';
import type {
	LobbyDecision,
	LobbyDecisionResult,
	LobbyEndOptions,
	LobbyEndResult,
	LobbyEntry,
	LobbyKnockResult,
	LobbyLine,
	LobbyParticipant,
	LobbyPresence,
	LobbyReturnResult,
	LobbySweepTick,
	LobbyTicketChange,
	LobbyWait
} from '../../models/lobby.model.js';
import { REDIS_KEY_PREFIX } from '../../models/redis.model.js';
import { RedisService } from '../redis.service.js';
import { CONSUME_SCRIPT } from './scripts/consume.script.js';
import { DECIDE_SCRIPT } from './scripts/decide.script.js';
import { END_SCRIPT } from './scripts/end.script.js';
import { JOINED_SCRIPT } from './scripts/joined.script.js';
import { KNOCK_SCRIPT } from './scripts/knock.script.js';
import { PRESENCE_SCRIPT } from './scripts/presence.script.js';
import { RETURN_SCRIPT } from './scripts/return.script.js';
import { SWEEP_SCRIPT } from './scripts/sweep.script.js';

/** Lua's JSON encoder writes an empty array as an object. */
const listOf = <T>(value: T[] | object | undefined): T[] => (Array.isArray(value) ? (value as T[]) : []);

const lineOf = (line: LobbyLine): LobbyLine => ({ ...line, waiting: listOf(line.waiting) });

/**
 * The waiting room in Redis, changed only by atomic scripts:
 * - `<prefix>:<roomId>`, hash of the room's line: participant identity to its entry, waiting or admitted;
 * - `<prefix>_wait:<waitId>`, hash of one wait, which its ticket finds: no TTL while it lasts, kept with its
 *   outcome for {@link INTERNAL_CONFIG.LOBBY_ENDED_WAIT_TTL} once it ends;
 * - `<prefix>_seen`, sorted set of every room's entries (`<roomId>:<waitId>`) by when their client was last
 *   seen, or by when they were admitted;
 * - `<prefix>_sweep`, hash of the sweep's last pass and last gap.
 */
@injectable()
export class LobbyStateService {
	protected readonly prefix: string = `${REDIS_KEY_PREFIX}lobby`;

	constructor(@inject(RedisService) protected redisService: RedisService) {}

	/** Starts a wait at the end of the line; null when the room's waiting room is full. */
	async knock(
		roomId: string,
		waitId: string,
		participant: Omit<LobbyParticipant, 'knockDate'>,
		principal?: string
	): Promise<LobbyKnockResult | null> {
		const presenceOffset =
			ms(INTERNAL_CONFIG.LOBBY_UNSEEN_TIMEOUT) - ms(INTERNAL_CONFIG.LOBBY_UNCONNECTED_KNOCK_TIMEOUT);
		const result = await this.run<LobbyKnockResult | { full: true }>(KNOCK_SCRIPT, [
			roomId,
			waitId,
			INTERNAL_CONFIG.LOBBY_MAX_ENTRIES,
			presenceOffset,
			JSON.stringify(participant),
			principal ?? ''
		]);
		return 'full' in result ? null : { ...result, line: lineOf(result.line) };
	}

	/**
	 * Admits or rejects the named waiting participants, all or none, or everyone waiting when none are
	 * named. `capacity` is the room's participant limit minus the participants connected, null without a limit.
	 */
	async decide(
		roomId: string,
		decision: LobbyDecision,
		identities: string[] | undefined,
		capacity: number | null
	): Promise<LobbyDecisionResult> {
		const result = await this.run<LobbyDecisionResult>(DECIDE_SCRIPT, [
			roomId,
			decision,
			capacity ?? '',
			...(identities ?? [])
		]);
		return 'decided' in result ? { decided: listOf(result.decided), line: lineOf(result.line) } : result;
	}

	/** Puts an admission not used yet back in its place in line. */
	async returnToLine(waitId: string): Promise<LobbyReturnResult> {
		const result = await this.run<LobbyReturnResult>(RETURN_SCRIPT, [waitId]);
		return 'entry' in result ? { entry: result.entry, line: lineOf(result.line) } : result;
	}

	/** Uses an admission to issue the join token; the entry keeps counting as a taken place. */
	consume(waitId: string): Promise<LobbyTicketChange> {
		return this.run<LobbyTicketChange>(CONSUME_SCRIPT, [waitId]);
	}

	/** Releases the place of an admitted participant who joined; null when they had none. */
	async joined(roomId: string, participantIdentity: string): Promise<LobbyEntry | null> {
		const { entry } = await this.run<{ entry?: LobbyEntry }>(JOINED_SCRIPT, [roomId, participantIdentity]);
		return entry ?? null;
	}

	/** Records that a wait's client is in touch, and answers its state; null when the wait is unknown. */
	async presence(waitId: string): Promise<LobbyPresence | null> {
		const presence = await this.run<LobbyPresence | { status?: never }>(PRESENCE_SCRIPT, [waitId]);
		return presence.status ? presence : null;
	}

	async end(roomId: string, outcome: MeetLobbyStatus, options: LobbyEndOptions = {}): Promise<LobbyEndResult> {
		const { waitIds, includeUsed = false, unseenFor } = options;
		const everyone = waitIds === undefined;

		if (waitIds?.length === 0) {
			return { ended: [], silent: [], line: { now: 0, from: 1, waiting: [] } };
		}

		const result = await this.run<LobbyEndResult>(END_SCRIPT, [
			roomId,
			outcome,
			everyone || includeUsed ? '1' : '0',
			unseenFor ?? '',
			...(waitIds ?? [])
		]);
		return { ended: listOf(result.ended), silent: listOf(result.silent), line: lineOf(result.line) };
	}

	/** Every entry of a room's line, waiting or admitted. */
	async entries(roomId: string): Promise<LobbyEntry[]> {
		const entries = await this.redisService.getHash(this.roomKey(roomId));
		return Object.values(entries).map((entry) => JSON.parse(entry) as LobbyEntry);
	}

	async findWait(waitId: string): Promise<LobbyWait | null> {
		const wait = await this.redisService.getHash(this.waitKey(waitId));

		if (!wait.roomId) return null;

		const value = await this.redisService.getHashField(this.roomKey(wait.roomId), wait.identity);
		const entry = value ? (JSON.parse(value) as LobbyEntry) : undefined;
		const inLine = entry?.waitId === waitId && !entry.used;
		return {
			waitId,
			roomId: wait.roomId,
			participant: JSON.parse(wait.participant) as LobbyParticipant,
			...(wait.principal && { principal: wait.principal }),
			status: inLine ? entry.status : ((wait.outcome as MeetLobbyStatus | undefined) ?? MeetLobbyStatus.EXPIRED),
			ended: !inLine
		};
	}

	/** Records a pass of the sweep and answers what it needs to decide whether to expire anyone. */
	async sweep(): Promise<LobbySweepTick> {
		const tick = await this.run<Omit<LobbySweepTick, 'due'> & { due: string[] | object }>(SWEEP_SCRIPT, [
			ms(INTERNAL_CONFIG.LOBBY_UNSEEN_TIMEOUT)
		]);
		const due = listOf<string>(tick.due).map((member) => {
			const separator = member.lastIndexOf(':');
			return { roomId: member.slice(0, separator), waitId: member.slice(separator + 1) };
		});
		return { ...tick, due };
	}

	async recordSweepGap(at: number): Promise<void> {
		await this.redisService.setHashField(`${this.prefix}_sweep`, 'gapAt', String(at));
	}

	protected roomKey(roomId: string): string {
		return `${this.prefix}:${roomId}`;
	}

	protected waitKey(waitId: string): string {
		return `${this.prefix}_wait:${waitId}`;
	}

	protected async run<T>(script: string, args: Array<string | number>): Promise<T> {
		const result = await this.redisService.runScript(
			script,
			[],
			[this.prefix, ms(INTERNAL_CONFIG.LOBBY_ENDED_WAIT_TTL), ...args]
		);
		return JSON.parse(result as string) as T;
	}
}
