import { MeetWaitingParticipantStatus } from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import ms from 'ms';
import { INTERNAL_CONFIG } from '../../config/internal-config.js';
import type {
	WaitingDecision,
	WaitingDecisionResult,
	WaitingEndOptions,
	WaitingEndResult,
	WaitingEntry,
	WaitingKnockResult,
	StoredWaitingParticipant,
	WaitingPresence,
	WaitingReturnResult,
	WaitingSweepTick,
	WaitingTicketChange,
	ParticipantWait
} from '../../models/waiting-participant.model.js';
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

/**
 * The waiting participants in Redis, changed only by atomic scripts:
 * - `<prefix>:<roomId>`, hash of the room's entries: participant identity to its entry, waiting or admitted;
 * - `<prefix>_wait:<waitId>`, hash of one wait, which its ticket finds: no TTL while it lasts, kept with its
 *   outcome for {@link INTERNAL_CONFIG.WAITING_PARTICIPANT_ENDED_WAIT_TTL} once it ends;
 * - `<prefix>_seen`, sorted set of every room's entries (`<roomId>:<waitId>`) by when their client was last
 *   seen, or by when they were admitted;
 * - `<prefix>_sweep`, hash of the sweep's last pass and last gap.
 */
@injectable()
export class WaitingParticipantStateService {
	protected readonly prefix: string = `${REDIS_KEY_PREFIX}waiting_participant`;

	constructor(@inject(RedisService) protected redisService: RedisService) {}

	/** Starts a wait; null when the room already holds the most waiting participants it may. */
	async knock(
		roomId: string,
		waitId: string,
		participant: Omit<StoredWaitingParticipant, 'knockDate'>,
		principal?: string
	): Promise<WaitingKnockResult | null> {
		const presenceOffset =
			ms(INTERNAL_CONFIG.WAITING_PARTICIPANT_UNSEEN_TIMEOUT) -
			ms(INTERNAL_CONFIG.WAITING_PARTICIPANT_UNCONNECTED_KNOCK_TIMEOUT);
		const result = await this.run<WaitingKnockResult | { full: true }>(KNOCK_SCRIPT, [
			roomId,
			waitId,
			INTERNAL_CONFIG.WAITING_PARTICIPANT_MAX_ENTRIES,
			presenceOffset,
			JSON.stringify(participant),
			principal ?? ''
		]);
		return 'full' in result ? null : result;
	}

	/**
	 * Rejects one waiting participant, or admits one or, when none is named, everyone waiting, all of them or
	 * nobody. `capacity` is the room's participant limit minus the participants connected, null without a limit.
	 */
	async decide(
		roomId: string,
		decision: WaitingDecision,
		participantIdentity: string | undefined,
		capacity: number | null
	): Promise<WaitingDecisionResult> {
		const result = await this.run<WaitingDecisionResult>(DECIDE_SCRIPT, [
			roomId,
			decision,
			capacity ?? '',
			...(participantIdentity === undefined ? [] : [participantIdentity])
		]);
		return 'decided' in result ? { decided: listOf(result.decided) } : result;
	}

	/** Makes an admission not used yet wait again, keeping its knock. */
	returnToWaiting(waitId: string): Promise<WaitingReturnResult> {
		return this.run<WaitingReturnResult>(RETURN_SCRIPT, [waitId]);
	}

	/** Uses an admission to issue the join token; the entry keeps counting as a taken place. */
	consume(waitId: string): Promise<WaitingTicketChange> {
		return this.run<WaitingTicketChange>(CONSUME_SCRIPT, [waitId]);
	}

	/** Releases the place of an admitted participant who joined; null when they had none. */
	async joined(roomId: string, participantIdentity: string): Promise<WaitingEntry | null> {
		const { entry } = await this.run<{ entry?: WaitingEntry }>(JOINED_SCRIPT, [roomId, participantIdentity]);
		return entry ?? null;
	}

	/** Records that a wait's client is in touch, and answers its state; null when the wait is unknown. */
	async presence(waitId: string): Promise<WaitingPresence | null> {
		const presence = await this.run<WaitingPresence | { status?: never }>(PRESENCE_SCRIPT, [waitId]);
		return presence.status ? presence : null;
	}

	async end(
		roomId: string,
		outcome: MeetWaitingParticipantStatus,
		options: WaitingEndOptions = {}
	): Promise<WaitingEndResult> {
		const { waitIds, includeUsed = false, unseenFor } = options;
		const everyone = waitIds === undefined;

		if (waitIds?.length === 0) {
			return { ended: [], silent: [] };
		}

		const result = await this.run<WaitingEndResult>(END_SCRIPT, [
			roomId,
			outcome,
			everyone || includeUsed ? '1' : '0',
			unseenFor ?? '',
			...(waitIds ?? [])
		]);
		return { ended: listOf(result.ended), silent: listOf(result.silent) };
	}

	/** Every entry of a room, waiting or admitted. */
	async entries(roomId: string): Promise<WaitingEntry[]> {
		const entries = await this.redisService.getHash(this.roomKey(roomId));
		return Object.values(entries).map((entry) => JSON.parse(entry) as WaitingEntry);
	}

	/** The entry of a participant in a room, waiting or admitted; null when they have none. */
	async entry(roomId: string, participantIdentity: string): Promise<WaitingEntry | null> {
		const value = await this.redisService.getHashField(this.roomKey(roomId), participantIdentity);
		return value ? (JSON.parse(value) as WaitingEntry) : null;
	}

	async findWait(waitId: string): Promise<ParticipantWait | null> {
		const wait = await this.redisService.getHash(this.waitKey(waitId));

		if (!wait.roomId) return null;

		const entry = await this.entry(wait.roomId, wait.identity);
		const ongoing = entry?.waitId === waitId && !entry.used;
		return {
			waitId,
			roomId: wait.roomId,
			participant: JSON.parse(wait.participant) as StoredWaitingParticipant,
			...(wait.principal && { principal: wait.principal }),
			status: ongoing
				? entry.status
				: ((wait.outcome as MeetWaitingParticipantStatus | undefined) ?? MeetWaitingParticipantStatus.EXPIRED),
			ended: !ongoing
		};
	}

	/** Records a pass of the sweep and answers what it needs to decide whether to expire anyone. */
	async sweep(): Promise<WaitingSweepTick> {
		const tick = await this.run<Omit<WaitingSweepTick, 'due'> & { due: string[] | object }>(SWEEP_SCRIPT, [
			ms(INTERNAL_CONFIG.WAITING_PARTICIPANT_UNSEEN_TIMEOUT)
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
			[this.prefix, ms(INTERNAL_CONFIG.WAITING_PARTICIPANT_ENDED_WAIT_TTL), ...args]
		);
		return JSON.parse(result as string) as T;
	}
}
