import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { MeetParticipantType, MeetRoomMemberRole, MeetWaitingParticipantStatus } from '@openvidu-meet/typings';
import { randomUUID } from 'crypto';
import { INTERNAL_CONFIG, setInternalConfig } from '../../../../src/config/internal-config.js';
import type {
	StoredWaitingParticipant,
	WaitingDecisionResult,
	WaitingEntry
} from '../../../../src/models/waiting-participant.model.js';
import { WaitingParticipantStateService } from '../../../../src/services/waiting-participants/waiting-participant-state.service.js';
import { LoggerService } from '../../../../src/services/logger.service.js';
import { RedisService } from '../../../../src/services/redis.service.js';

/**
 * The waiting participant scripts over a real Redis, under a key prefix of their own so they touch nothing
 * else in the database. Redis time cannot be moved, so a wait is made older by lowering its score in
 * the set of the last time each wait was seen.
 */
class TestWaitingParticipantState extends WaitingParticipantStateService {
	protected override readonly prefix = `ov_meet_test_${randomUUID()}:waiting_participant`;

	constructor(readonly redis: RedisService) {
		super(redis);
	}

	keys(): Promise<string[]> {
		return this.redis.getKeys(`${this.prefix}*`);
	}

	async seenAt(roomId: string, waitId: string): Promise<number | null> {
		const score = await this.redis.runScript(
			"return redis.call('ZSCORE', KEYS[1], ARGV[1])",
			[this.seenKey],
			[`${roomId}:${waitId}`]
		);
		return score ? Number(score) : null;
	}

	async age(roomId: string, waitId: string, byMs: number): Promise<void> {
		await this.redis.runScript(
			"return redis.call('ZINCRBY', KEYS[1], ARGV[1], ARGV[2])",
			[this.seenKey],
			[-byMs, `${roomId}:${waitId}`]
		);
	}

	/** The waits whose key never expires, which must be exactly the waits with an entry in some room. */
	async waitsWithoutTtl(): Promise<string[]> {
		const waitKeys = (await this.keys()).filter((key) => key.startsWith(`${this.prefix}_wait:`));
		const ttls = await Promise.all(
			waitKeys.map((key) => this.redis.runScript("return redis.call('PTTL', KEYS[1])", [key], []))
		);
		return waitKeys.filter((_key, index) => ttls[index] === -1).map((key) => key.slice(key.lastIndexOf(':') + 1));
	}

	async waitsWithEntry(roomIds: string[]): Promise<string[]> {
		const entries = await Promise.all(roomIds.map((roomId) => this.entries(roomId)));
		return entries.flat().map(({ waitId }) => waitId);
	}

	async cleanup(): Promise<void> {
		const keys = await this.keys();

		if (keys.length > 0) await this.redis.delete(keys);
	}

	get seenKey(): string {
		return `${this.prefix}_seen`;
	}
}

const participant = (identity: string): Omit<StoredWaitingParticipant, 'knockDate'> => ({
	participantIdentity: identity,
	participantName: identity.toUpperCase(),
	type: MeetParticipantType.ANONYMOUS,
	role: MeetRoomMemberRole.SPEAKER,
	roomName: 'Locked room'
});

describe('Waiting participant state in Redis', () => {
	let state: TestWaitingParticipantState;
	let roomId: string;
	const rooms: string[] = [];
	const originalMaxEntries = INTERNAL_CONFIG.WAITING_PARTICIPANT_MAX_ENTRIES;

	const knock = async (identity: string, waitId = `wait-${identity}-${randomUUID()}`, principal?: string) => {
		const result = await state.knock(roomId, waitId, participant(identity), principal);
		expect(result).not.toBeNull();
		return result!.entry;
	};

	const waitingOf = async () =>
		(await state.entries(roomId))
			.filter(({ status }) => status === MeetWaitingParticipantStatus.WAITING)
			.map(({ participantIdentity }) => participantIdentity)
			.sort();

	const decidedOf = (result: WaitingDecisionResult) =>
		'decided' in result ? result.decided.map(({ participantIdentity }) => participantIdentity).sort() : result;

	const expectEndedWaitsToExpire = async () => {
		expect((await state.waitsWithoutTtl()).sort()).toEqual((await state.waitsWithEntry(rooms)).sort());
	};

	beforeAll(() => {
		state = new TestWaitingParticipantState(new RedisService(new LoggerService()));
	});

	beforeEach(() => {
		roomId = `locked_room_${randomUUID()}`;
		rooms.push(roomId);
	});

	afterEach(async () => {
		setInternalConfig({ WAITING_PARTICIPANT_MAX_ENTRIES: originalMaxEntries });
		await expectEndedWaitsToExpire();
		expect((await state.keys()).filter((key) => key.includes('_line:'))).toEqual([]);
	});

	afterAll(async () => {
		await state.cleanup();
		state.redis.cleanup();
	});

	describe('knock', () => {
		it('starts the wait of each participant, unseen for longer than a fresh presence', async () => {
			const ana = await knock('ana');
			const ben = await knock('ben');

			expect(ana).toMatchObject({ participantIdentity: 'ana', status: MeetWaitingParticipantStatus.WAITING });
			expect(await waitingOf()).toEqual(['ana', 'ben']);
			const seenAt = await state.seenAt(roomId, ben.waitId);
			expect(ben.knockDate - seenAt!).toBe(45_000);
		});

		it('refuses a participant beyond the most entries a room holds, admitted ones included', async () => {
			setInternalConfig({ WAITING_PARTICIPANT_MAX_ENTRIES: 2 });
			await knock('ana');
			await knock('ben');
			await state.decide(roomId, 'admit', 'ana', null);

			expect(await state.knock(roomId, 'wait-zoe', participant('zoe'))).toBeNull();
			expect(await state.findWait('wait-zoe')).toBeNull();
		});

		it('ends the earlier wait of the same identity as left and starts a new one', async () => {
			const first = await knock('ana', 'wait-ana-1', 'member-ana');
			await knock('ben');
			const result = await state.knock(roomId, 'wait-ana-2', participant('ana'), 'member-ana');

			expect(result!.replaced?.waitId).toBe(first.waitId);
			expect(await waitingOf()).toEqual(['ana', 'ben']);
			expect(await state.findWait(first.waitId)).toMatchObject({
				status: MeetWaitingParticipantStatus.LEFT,
				ended: true
			});
			expect(await state.findWait('wait-ana-2')).toMatchObject({
				principal: 'member-ana',
				status: MeetWaitingParticipantStatus.WAITING,
				ended: false
			});
		});

		it('still lets the same identity ask again when the room is full', async () => {
			setInternalConfig({ WAITING_PARTICIPANT_MAX_ENTRIES: 1 });
			await knock('ana');

			expect(await state.knock(roomId, 'wait-ana-again', participant('ana'))).not.toBeNull();
		});
	});

	describe('decide', () => {
		it('admits one participant who waits, and answers who does not', async () => {
			await knock('ana');
			await knock('ben');

			expect(await state.decide(roomId, 'admit', 'zoe', null)).toEqual({ notWaiting: 'zoe' });
			expect(decidedOf(await state.decide(roomId, 'admit', 'ana', null))).toEqual(['ana']);
			expect(await waitingOf()).toEqual(['ben']);
		});

		it('answers no places for one participant when no place is free, admitted ones taking theirs', async () => {
			await knock('ana');
			await knock('ben');
			await state.decide(roomId, 'admit', 'ana', 1);

			expect(await state.decide(roomId, 'admit', 'ben', 1)).toEqual({ noPlaces: true });
			expect(await waitingOf()).toEqual(['ben']);
		});

		it('admits everyone waiting when they all fit', async () => {
			await knock('ana');
			await knock('ben');
			await knock('zoe');

			expect(decidedOf(await state.decide(roomId, 'admit', undefined, 3))).toEqual(['ana', 'ben', 'zoe']);
			expect(await waitingOf()).toEqual([]);
		});

		it('admits nobody when everyone waiting does not fit, admitted ones taking their places', async () => {
			await knock('ana');
			await knock('ben');
			await knock('zoe');
			await state.decide(roomId, 'admit', 'ana', 3);

			expect(await state.decide(roomId, 'admit', undefined, 2)).toEqual({ noPlaces: true });
			expect(await waitingOf()).toEqual(['ben', 'zoe']);
		});

		it('admits everyone waiting without a participant limit, and nobody when nobody waits', async () => {
			await knock('ana');
			await knock('ben');

			expect(decidedOf(await state.decide(roomId, 'admit', undefined, null))).toEqual(['ana', 'ben']);
			expect(decidedOf(await state.decide(roomId, 'admit', undefined, 0))).toEqual([]);
		});

		it('writes the admission time as when the admitted entry was last seen', async () => {
			const ana = await knock('ana');
			await state.decide(roomId, 'admit', 'ana', null);

			expect((await state.seenAt(roomId, ana.waitId))! - ana.knockDate).toBeGreaterThanOrEqual(0);
		});

		it('gives one of two concurrent admissions the last free place and the other no places', async () => {
			await knock('ana');
			await knock('ben');

			const results = await Promise.all([
				state.decide(roomId, 'admit', 'ana', 1),
				state.decide(roomId, 'admit', 'ben', 1)
			]);

			expect(results.filter((result) => 'decided' in result)).toHaveLength(1);
			expect(results.filter((result) => 'noPlaces' in result)).toHaveLength(1);
		});

		it('applies the first of an admission and a rejection of the same participant, the other finding nobody', async () => {
			await knock('ana');

			const results = await Promise.all([
				state.decide(roomId, 'admit', 'ana', null),
				state.decide(roomId, 'reject', 'ana', null)
			]);

			expect(results.filter((result) => 'decided' in result)).toHaveLength(1);
			expect(results.filter((result) => 'notWaiting' in result)).toHaveLength(1);
		});

		it('rejects one participant, ending their wait, and refuses to reject an admitted one', async () => {
			const ben = await knock('ben');
			await knock('ana');
			await state.decide(roomId, 'admit', 'ana', null);

			expect(decidedOf(await state.decide(roomId, 'reject', 'ben', null))).toEqual(['ben']);
			expect(await state.findWait(ben.waitId)).toMatchObject({
				status: MeetWaitingParticipantStatus.REJECTED,
				ended: true
			});
			expect(await state.seenAt(roomId, ben.waitId)).toBeNull();
			expect(await state.decide(roomId, 'reject', 'ana', null)).toEqual({ notWaiting: 'ana' });
			expect((await state.entries(roomId)).map(({ participantIdentity }) => participantIdentity)).toEqual([
				'ana'
			]);
		});
	});

	describe('returnToWaiting', () => {
		it('makes an admission wait again, keeping its knock', async () => {
			const ana = await knock('ana');
			await knock('ben');
			await state.decide(roomId, 'admit', 'ana', null);

			const result = await state.returnToWaiting(ana.waitId);

			expect(result).toEqual({
				entry: expect.objectContaining({
					status: MeetWaitingParticipantStatus.WAITING,
					knockDate: ana.knockDate
				}),
				waitedSeconds: expect.any(Number)
			});
			expect(await waitingOf()).toEqual(['ana', 'ben']);
		});

		it('answers the status of a wait that is not admitted', async () => {
			const ana = await knock('ana');
			const ben = await knock('ben');
			await state.decide(roomId, 'reject', 'ben', null);

			expect(await state.returnToWaiting(ana.waitId)).toEqual({ status: MeetWaitingParticipantStatus.WAITING });
			expect(await state.returnToWaiting(ben.waitId)).toEqual({ status: MeetWaitingParticipantStatus.REJECTED });
			expect(await state.returnToWaiting('unknown-wait')).toEqual({});
		});
	});

	describe('consume', () => {
		it('marks the admission used once, keeping the entry and recording the outcome', async () => {
			const ana = await knock('ana');
			await state.decide(roomId, 'admit', 'ana', null);

			expect(await state.consume(ana.waitId)).toMatchObject({ entry: { used: true } });
			expect(await state.consume(ana.waitId)).toEqual({ status: MeetWaitingParticipantStatus.ADMITTED });
			expect(await state.findWait(ana.waitId)).toMatchObject({
				status: MeetWaitingParticipantStatus.ADMITTED,
				ended: true
			});
			expect(await state.entries(roomId)).toHaveLength(1);
			expect(await state.returnToWaiting(ana.waitId)).toEqual({ status: MeetWaitingParticipantStatus.ADMITTED });
		});

		it('does not use the admission of a wait that is waiting or ended', async () => {
			const ana = await knock('ana');

			expect(await state.consume(ana.waitId)).toEqual({ status: MeetWaitingParticipantStatus.WAITING });

			await state.decide(roomId, 'admit', 'ana', null);
			await state.end(roomId, MeetWaitingParticipantStatus.LEFT, { waitIds: [ana.waitId] });

			expect(await state.consume(ana.waitId)).toEqual({ status: MeetWaitingParticipantStatus.LEFT });
		});
	});

	describe('joined', () => {
		it('releases the place of an admitted participant, used or not', async () => {
			const ana = await knock('ana');
			const ben = await knock('ben');
			await state.decide(roomId, 'admit', undefined, null);
			await state.consume(ana.waitId);

			expect((await state.joined(roomId, 'ana'))?.waitId).toBe(ana.waitId);
			expect((await state.joined(roomId, 'ben'))?.waitId).toBe(ben.waitId);
			expect(await state.entries(roomId)).toEqual([]);
			expect(await state.findWait(ana.waitId)).toMatchObject({
				status: MeetWaitingParticipantStatus.ADMITTED,
				ended: true
			});
			expect(await state.findWait(ben.waitId)).toMatchObject({
				status: MeetWaitingParticipantStatus.ADMITTED,
				ended: true
			});
		});

		it('leaves a waiting participant waiting', async () => {
			await knock('ana');

			expect(await state.joined(roomId, 'ana')).toBeNull();
			expect(await waitingOf()).toEqual(['ana']);
		});
	});

	describe('presence', () => {
		it('refreshes a waiting participant and answers their time waited, and nothing about the others', async () => {
			await knock('ana');
			const ben = await knock('ben');

			const presence = await state.presence(ben.waitId);

			expect(presence).toEqual({
				roomId,
				status: MeetWaitingParticipantStatus.WAITING,
				waitedSeconds: 0
			});
			expect((await state.seenAt(roomId, ben.waitId))! - ben.knockDate).toBeGreaterThanOrEqual(0);
		});

		it('keeps the admission time of an admitted participant', async () => {
			const ana = await knock('ana');
			await state.decide(roomId, 'admit', 'ana', null);
			await state.age(roomId, ana.waitId, 30_000);
			const admittedSeenAt = await state.seenAt(roomId, ana.waitId);

			expect(await state.presence(ana.waitId)).toEqual({ roomId, status: MeetWaitingParticipantStatus.ADMITTED });
			expect(await state.seenAt(roomId, ana.waitId)).toBe(admittedSeenAt);
		});

		it('answers the outcome of an ended wait and nothing for an unknown one', async () => {
			const ana = await knock('ana');
			await state.decide(roomId, 'reject', undefined, null);

			expect(await state.presence(ana.waitId)).toEqual({ roomId, status: MeetWaitingParticipantStatus.REJECTED });
			expect(await state.presence('unknown-wait')).toBeNull();
		});
	});

	describe('end', () => {
		it('ends the given waits, leaving the others waiting', async () => {
			const ana = await knock('ana');
			await knock('ben');

			const result = await state.end(roomId, MeetWaitingParticipantStatus.LEFT, { waitIds: [ana.waitId] });

			expect(result.ended.map(({ waitId }) => waitId)).toEqual([ana.waitId]);
			expect(await waitingOf()).toEqual(['ben']);
		});

		it('ends nothing for a wait already ended', async () => {
			const ana = await knock('ana');
			await state.end(roomId, MeetWaitingParticipantStatus.LEFT, { waitIds: [ana.waitId] });

			expect(
				(await state.end(roomId, MeetWaitingParticipantStatus.LEFT, { waitIds: [ana.waitId] })).ended
			).toEqual([]);
			expect(await state.findWait(ana.waitId)).toMatchObject({ status: MeetWaitingParticipantStatus.LEFT });
		});

		it('leaves a used admission alone unless asked to remove it, then removes it silently', async () => {
			const ana = await knock('ana');
			await state.decide(roomId, 'admit', 'ana', null);
			await state.consume(ana.waitId);

			expect(
				(await state.end(roomId, MeetWaitingParticipantStatus.LEFT, { waitIds: [ana.waitId] })).ended
			).toEqual([]);

			const result = await state.end(roomId, MeetWaitingParticipantStatus.EXPIRED, {
				waitIds: [ana.waitId],
				includeUsed: true
			});

			expect(result.ended).toEqual([]);
			expect(result.silent.map(({ waitId }) => waitId)).toEqual([ana.waitId]);
			expect(await state.findWait(ana.waitId)).toMatchObject({
				status: MeetWaitingParticipantStatus.ADMITTED,
				ended: true
			});
		});

		it('ends every wait of the room, used admissions included, keeping each outcome for a while', async () => {
			const ana = await knock('ana');
			const ben = await knock('ben');
			const zoe = await knock('zoe');
			await state.decide(roomId, 'admit', 'ben', null);
			await state.decide(roomId, 'admit', 'zoe', null);
			await state.consume(zoe.waitId);

			const result = await state.end(roomId, MeetWaitingParticipantStatus.ROOM_CLOSED);

			expect(result.ended.map(({ waitId }) => waitId).sort()).toEqual([ana.waitId, ben.waitId].sort());
			expect(result.silent.map(({ waitId }) => waitId)).toEqual([zoe.waitId]);
			expect(await state.entries(roomId)).toEqual([]);
			expect(await state.findWait(ana.waitId)).toMatchObject({
				status: MeetWaitingParticipantStatus.ROOM_CLOSED
			});
			expect(await state.findWait(zoe.waitId)).toMatchObject({ status: MeetWaitingParticipantStatus.ADMITTED });
		});

		it('only ends the waits still unseen when the script runs', async () => {
			const ana = await knock('ana');
			const ben = await knock('ben');
			await state.presence(ana.waitId);
			await state.presence(ben.waitId);
			await state.age(roomId, ben.waitId, 61_000);

			const result = await state.end(roomId, MeetWaitingParticipantStatus.EXPIRED, {
				waitIds: [ana.waitId, ben.waitId],
				includeUsed: true,
				unseenFor: 60_000
			});

			expect(result.ended.map(({ waitId }) => waitId)).toEqual([ben.waitId]);
			expect(await waitingOf()).toEqual(['ana']);
		});
	});

	describe('sweep', () => {
		it('records each pass and finds the waits of this prefix unseen for a minute', async () => {
			const ana = await knock('ana');
			const ben = await knock('ben');
			await state.presence(ana.waitId);
			await state.age(roomId, ben.waitId, 16_000);

			const first = await state.sweep();
			const second = await state.sweep();

			expect(first.due.filter((wait) => wait.roomId === roomId)).toEqual([{ roomId, waitId: ben.waitId }]);
			expect(second.lastRun).toBe(first.now);
			expect(second.gapAt).toBeUndefined();

			await state.recordSweepGap(second.now);

			expect((await state.sweep()).gapAt).toBe(second.now);
			await state.end(roomId, MeetWaitingParticipantStatus.EXPIRED, {
				waitIds: [ben.waitId],
				includeUsed: true,
				unseenFor: 60_000
			});
			expect(await waitingOf()).toEqual(['ana']);
		});
	});

	it('keeps the participant of a wait as it asked, with the room name', async () => {
		const ana = await knock('ana');

		const wait = await state.findWait(ana.waitId);

		expect(wait?.participant).toEqual({ ...participant('ana'), knockDate: ana.knockDate });
		expect(wait?.roomId).toBe(roomId);
		expect(wait).not.toHaveProperty('principal');
	});

	it('stores entries that name nothing but the participant and their wait', async () => {
		const ana: WaitingEntry = await knock('ana');

		expect(Object.keys(ana).sort()).toEqual(
			[
				'knockDate',
				'participantIdentity',
				'participantName',
				'role',
				'roomName',
				'status',
				'type',
				'waitId'
			].sort()
		);
	});
});
