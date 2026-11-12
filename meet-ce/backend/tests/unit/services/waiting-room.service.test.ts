import { ParticipantInfo_Kind } from '@livekit/protocol';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { MeetParticipantWaitingChangedPayload, MeetParticipantKnockedPayload } from '@openvidu-meet/typings';
import {
	MEET_WAITING_ROOM_STATE_MESSAGE,
	MeetEventOrigin,
	MeetWaitingRoomParticipantType,
	MeetWaitingRoomReason,
	MeetWaitingRoomStatus
} from '@openvidu-meet/typings';
import { createHash } from 'crypto';
import type {
	WaitingRoomDecisionResult,
	WaitingRoomEndOptions,
	WaitingRoomEndResult,
	WaitingRoomEntry,
	WaitingRoomKnockResult,
	WaitingRoomLine,
	WaitingRoomWait
} from '../../../src/models/waiting-room.model.js';
import { WaitingRoomAdmissionPolicy } from '../../../src/services/waiting-room/waiting-room-admission.policy.js';
import { WaitingRoomService } from '../../../src/services/waiting-room/waiting-room.service.js';

const noopLogger = { info: () => {}, warn: () => {}, debug: () => {}, error: () => {}, verbose: () => {} };
const NOW = 1_800_000_000_000;
const noLine: WaitingRoomLine = { now: NOW, from: 1, waiting: [] };

const entry = (identity: string, overrides: Partial<WaitingRoomEntry> = {}): WaitingRoomEntry => ({
	waitId: `wait-${identity}`,
	participantIdentity: identity,
	participantName: identity.toUpperCase(),
	type: MeetWaitingRoomParticipantType.ANONYMOUS,
	knockDate: NOW - 90_000,
	roomName: 'Room 1',
	status: MeetWaitingRoomStatus.WAITING,
	...overrides
});

/** Answers each script with what the test sets, and records what it was asked. */
class FakeWaitingRoomState {
	knockResult: WaitingRoomKnockResult | null = { entry: entry('ana'), line: noLine };
	decideResult: WaitingRoomDecisionResult = { decided: [], line: noLine };
	endResult: WaitingRoomEndResult = { ended: [], silent: [], line: noLine };
	entriesResult: WaitingRoomEntry[] = [];
	wait: WaitingRoomWait | null = null;
	knocks: unknown[][] = [];
	decisions: unknown[][] = [];
	ends: [string, MeetWaitingRoomStatus, WaitingRoomEndOptions | undefined][] = [];
	waitIdsLookedUp: string[] = [];
	joinedFails = false;

	async knock(...args: unknown[]) {
		this.knocks.push(args);
		return this.knockResult;
	}

	async decide(...args: unknown[]) {
		this.decisions.push(args);
		return this.decideResult;
	}

	async end(roomId: string, outcome: MeetWaitingRoomStatus, options?: WaitingRoomEndOptions) {
		this.ends.push([roomId, outcome, options]);
		return this.endResult;
	}

	async entries() {
		return this.entriesResult;
	}

	async findWait(waitId: string) {
		this.waitIdsLookedUp.push(waitId);
		return this.wait;
	}

	async joined(_roomId: string, identity: string) {
		if (this.joinedFails) throw new Error('Redis down');

		return identity === 'ana' ? entry('ana', { status: MeetWaitingRoomStatus.ADMITTED }) : null;
	}

	async consume() {
		return { entry: entry('ana', { status: MeetWaitingRoomStatus.ADMITTED, used: true }) };
	}

	async returnToLine() {
		return { entry: entry('ana'), line: { now: NOW, from: 1, waiting: [['wait-ana', NOW - 90_000]] } };
	}
}

const build = ({
	maxParticipants = null as number | null,
	waitingRoomEnabled = true,
	connected = [ParticipantInfo_Kind.STANDARD, ParticipantInfo_Kind.STANDARD, ParticipantInfo_Kind.EGRESS]
} = {}) => {
	const state = new FakeWaitingRoomState();
	const states: [string, string, string, unknown][] = [];
	const signals: string[] = [];
	const knocked: MeetParticipantKnockedPayload[] = [];
	const changed: MeetParticipantWaitingChangedPayload[] = [];
	const service = new WaitingRoomService(
		...([
			{
				findByRoomId: async (roomId: string) =>
					roomId === 'missing'
						? null
						: { config: { maxParticipants, waitingRoom: { enabled: waitingRoomEnabled } } }
			},
			{ listRoomParticipants: async () => connected.map((kind) => ({ kind })) },
			state,
			new WaitingRoomAdmissionPolicy(),
			{
				send: async (roomId: string, address: string, type: string, data: unknown) => {
					states.push([roomId, address, type, data]);
				}
			},
			{ sendWaitingRoomUpdatedSignal: async (roomId: string) => signals.push(roomId) },
			{
				sendParticipantKnockedWebhook: (payload: MeetParticipantKnockedPayload) => knocked.push(payload),
				sendParticipantWaitingChangedWebhook: (payload: MeetParticipantWaitingChangedPayload) =>
					changed.push(payload)
			},
			noopLogger
		] as unknown as ConstructorParameters<typeof WaitingRoomService>)
	);
	const stateOf = (waitId: string) => states.filter(([, address]) => address === waitId).map(([, , , data]) => data);
	return { service, state, states, stateOf, signals, knocked, changed };
};

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

describe('WaitingRoomService', () => {
	describe('knock', () => {
		it('answers a ticket whose hash is the wait, and the participant, with the type and principal from the credential', async () => {
			const { service, state } = build();
			state.knockResult = {
				entry: entry('guest-1', {
					participantName: 'Ana',
					type: MeetWaitingRoomParticipantType.IDENTIFIED_GUEST,
					externalId: 'u-42'
				}),
				line: noLine
			};

			const answer = await service.knock(
				{ roomId: 'room-1', roomName: 'Room 1' },
				{ participantIdentity: 'guest-1', participantName: 'Ana', externalId: 'u-42', memberId: 'guest-1' }
			);

			expect(answer.participant).toEqual({
				participantIdentity: 'guest-1',
				participantName: 'Ana',
				type: MeetWaitingRoomParticipantType.IDENTIFIED_GUEST,
				externalId: 'u-42',
				knockDate: NOW - 90_000
			});
			expect(answer.waitingRoomTicket).toMatch(/^[A-Za-z0-9_-]{22}$/);
			expect(state.knocks).toEqual([
				[
					'room-1',
					sha256(answer.waitingRoomTicket),
					{
						participantIdentity: 'guest-1',
						participantName: 'Ana',
						type: MeetWaitingRoomParticipantType.IDENTIFIED_GUEST,
						externalId: 'u-42',
						roomName: 'Room 1'
					},
					'guest-1'
				]
			]);
		});

		it('tells the webhooks and the meeting at once, before the waiting screen connects', async () => {
			const { service, knocked, signals, changed } = build();

			await service.knock(
				{ roomId: 'room-1', roomName: 'Room 1' },
				{ participantIdentity: 'ana', participantName: 'Ana' }
			);

			expect(knocked).toEqual([
				{
					roomId: 'room-1',
					roomName: 'Room 1',
					participant: {
						participantIdentity: 'ana',
						participantName: 'ANA',
						type: MeetWaitingRoomParticipantType.ANONYMOUS,
						knockDate: NOW - 90_000
					}
				}
			]);
			expect(signals).toEqual(['room-1']);
			expect(changed).toEqual([]);
		});

		it('ends the earlier wait of the same identity as left, telling it and the webhooks', async () => {
			const { service, state, stateOf, changed } = build();
			state.knockResult = { entry: entry('ana', { waitId: 'wait-new' }), replaced: entry('ana'), line: noLine };

			await service.knock(
				{ roomId: 'room-1', roomName: 'Room 1' },
				{ participantIdentity: 'ana', participantName: 'Ana' }
			);

			expect(stateOf('wait-ana')).toEqual([
				{
					status: MeetWaitingRoomStatus.LEFT,
					origin: MeetEventOrigin.PARTICIPANT,
					reason: MeetWaitingRoomReason.REPLACED
				}
			]);
			expect(changed).toEqual([
				expect.objectContaining({
					status: MeetWaitingRoomStatus.LEFT,
					origin: MeetEventOrigin.PARTICIPANT,
					reason: MeetWaitingRoomReason.REPLACED
				})
			]);
		});

		it('refuses a knock when the waiting room is full', async () => {
			const { service, state, knocked } = build();
			state.knockResult = null;

			await expect(
				service.knock(
					{ roomId: 'room-1', roomName: 'Room 1' },
					{ participantIdentity: 'ana', participantName: 'Ana' }
				)
			).rejects.toMatchObject({ statusCode: 409, message: "The waiting room of room 'room-1' is full" });
			expect(knocked).toEqual([]);
		});
	});

	describe('waiters whose place changed', () => {
		it('get their place and time waited, and nothing about anyone else', async () => {
			const { service, state, states } = build();
			state.endResult = {
				ended: [entry('ana')],
				silent: [],
				line: { now: NOW, from: 1, waiting: [['wait-ben', NOW - 61_500]] }
			};

			await service.endWaits('room-1', MeetWaitingRoomStatus.LEFT, MeetEventOrigin.PARTICIPANT, ['wait-ana']);

			expect(states).toEqual([
				[
					'room-1',
					'wait-ana',
					MEET_WAITING_ROOM_STATE_MESSAGE,
					{ status: MeetWaitingRoomStatus.LEFT, origin: MeetEventOrigin.PARTICIPANT }
				],
				[
					'room-1',
					'wait-ben',
					MEET_WAITING_ROOM_STATE_MESSAGE,
					{ status: MeetWaitingRoomStatus.WAITING, queuePosition: 1, waitedSeconds: 61 }
				]
			]);
		});
	});

	describe('list', () => {
		it('lists those waiting in arrival order, and the free places counting the admitted ones', async () => {
			const { service, state } = build({ maxParticipants: 5 });
			state.entriesResult = [
				entry('zoe', { knockDate: NOW }),
				entry('ben', { status: MeetWaitingRoomStatus.ADMITTED, used: true }),
				entry('ana', { knockDate: NOW - 1 }),
				entry('amy', { knockDate: NOW })
			];

			const list = await service.list('room-1');

			expect(list.participants.map(({ participantIdentity }) => participantIdentity)).toEqual([
				'ana',
				'amy',
				'zoe'
			]);
			expect(list.participants[0]).toEqual({
				participantIdentity: 'ana',
				participantName: 'ANA',
				type: MeetWaitingRoomParticipantType.ANONYMOUS,
				knockDate: NOW - 1
			});
			expect(list.availablePlaces).toBe(2);
		});

		it('never answers fewer than no free places, and none without a limit', async () => {
			const full = build({ maxParticipants: 2 });
			full.state.entriesResult = [entry('ana', { status: MeetWaitingRoomStatus.ADMITTED })];

			expect((await full.service.list('room-1')).availablePlaces).toBe(0);
			expect((await build().service.list('room-1')).availablePlaces).toBeNull();
		});

		it('is empty with the waiting room off', async () => {
			const { service, state } = build({ waitingRoomEnabled: false });
			state.entriesResult = [entry('ana')];

			expect((await service.list('room-1')).participants).toEqual([]);
		});

		it('answers 404 for a room that does not exist', async () => {
			await expect(build().service.list('missing')).rejects.toMatchObject({ statusCode: 404 });
		});
	});

	describe('admit and reject', () => {
		it('admits within the capacity the meeting has, counting only people', async () => {
			const { service, state } = build({ maxParticipants: 5 });

			await service.admit('room-1', ['ana']);

			expect(state.decisions).toEqual([['room-1', 'admit', ['ana'], 3]]);
		});

		it('tells each admitted participant, the webhooks as a moderator decision, and the meeting', async () => {
			const { service, state, stateOf, changed, signals } = build();
			state.decideResult = {
				decided: [entry('ana', { status: MeetWaitingRoomStatus.ADMITTED })],
				line: { now: NOW, from: 1, waiting: [['wait-ben', NOW]] }
			};

			const admitted = await service.admit('room-1');

			expect(admitted.map(({ participantIdentity }) => participantIdentity)).toEqual(['ana']);
			expect(stateOf('wait-ana')).toEqual([
				{ status: MeetWaitingRoomStatus.ADMITTED, origin: MeetEventOrigin.MODERATOR }
			]);
			expect(stateOf('wait-ben')).toEqual([
				{ status: MeetWaitingRoomStatus.WAITING, queuePosition: 1, waitedSeconds: 0 }
			]);
			expect(changed).toEqual([
				expect.objectContaining({
					roomId: 'room-1',
					roomName: 'Room 1',
					status: MeetWaitingRoomStatus.ADMITTED,
					origin: MeetEventOrigin.MODERATOR
				})
			]);
			expect(signals).toEqual(['room-1']);
		});

		it('answers 404 naming the participant that no longer waits, and 409 when they do not fit', async () => {
			const { service, state } = build({ maxParticipants: 3 });
			state.decideResult = { notWaiting: 'ben' };

			await expect(service.reject('room-1', ['ana', 'ben'])).rejects.toMatchObject({
				statusCode: 404,
				message: "Participant 'ben' is not waiting in room 'room-1'"
			});

			state.decideResult = { noPlaces: true };

			await expect(service.admit('room-1', ['ana', 'ben', 'zoe'])).rejects.toMatchObject({
				statusCode: 409,
				message: "Room 'room-1' has fewer free places than the 3 participants to admit"
			});
		});

		it('rejects without counting the places, and tells nobody when nobody was waiting', async () => {
			const { service, state, signals, changed } = build({ maxParticipants: 3 });

			expect(await service.reject('room-1')).toEqual([]);
			expect(state.decisions).toEqual([['room-1', 'reject', undefined, null]]);
			expect(signals).toEqual([]);
			expect(changed).toEqual([]);
		});

		it('with the waiting room off, answers 404 for a named participant and nobody for everyone waiting', async () => {
			const { service, state } = build({ waitingRoomEnabled: false });

			await expect(service.admit('room-1', ['ana'])).rejects.toMatchObject({ statusCode: 404 });
			expect(await service.reject('room-1')).toEqual([]);
			expect(state.decisions).toEqual([]);
		});
	});

	describe('ending waits', () => {
		it('leaves a wait of the room of the request, as the participant', async () => {
			const { service, state } = build();
			state.wait = {
				waitId: 'wait-ana',
				roomId: 'room-1',
				status: MeetWaitingRoomStatus.WAITING,
				ended: false
			} as WaitingRoomWait;

			await service.leave('room-1', 'ticket-of-ana');

			expect(state.waitIdsLookedUp).toEqual([sha256('ticket-of-ana')]);
			expect(state.ends).toEqual([['room-1', MeetWaitingRoomStatus.LEFT, { waitIds: ['wait-ana'] }]]);
		});

		it('changes nothing for a ticket of another room, an ended wait or an unknown one', async () => {
			const { service, state } = build();

			state.wait = { waitId: 'wait-ana', roomId: 'room-2', ended: false } as WaitingRoomWait;
			await service.leave('room-1', 'ticket');
			state.wait = { waitId: 'wait-ana', roomId: 'room-1', ended: true } as WaitingRoomWait;
			await service.leave('room-1', 'ticket');
			state.wait = null;
			await service.leave('room-1', 'ticket');

			expect(state.ends).toEqual([]);
		});

		it('expires only waits still unseen, used admissions silently, telling why each one expired', async () => {
			const { service, state, changed, stateOf } = build();
			state.endResult = {
				ended: [entry('ana'), entry('cleo', { status: MeetWaitingRoomStatus.ADMITTED })],
				silent: [entry('ben', { status: MeetWaitingRoomStatus.ADMITTED, used: true })],
				line: noLine
			};

			await service.expire('room-1', ['wait-ana', 'wait-ben']);

			expect(state.ends).toEqual([
				[
					'room-1',
					MeetWaitingRoomStatus.EXPIRED,
					{ waitIds: ['wait-ana', 'wait-ben'], includeUsed: true, unseenFor: 60_000 }
				]
			]);
			expect(changed).toEqual([
				expect.objectContaining({
					participant: expect.objectContaining({ participantIdentity: 'ana' }),
					status: MeetWaitingRoomStatus.EXPIRED,
					origin: MeetEventOrigin.SYSTEM,
					reason: MeetWaitingRoomReason.CONNECTION_LOST
				}),
				expect.objectContaining({
					participant: expect.objectContaining({ participantIdentity: 'cleo' }),
					reason: MeetWaitingRoomReason.ADMISSION_UNUSED
				})
			]);
			expect(stateOf('wait-ben')).toEqual([]);
		});

		it('expires at once the wait of a page that closed, unless another connection was seen since', async () => {
			const { service, state, changed, stateOf } = build();
			state.endResult = { ended: [entry('ana')], silent: [], line: noLine };

			await service.pageClosed('room-1', 'wait-ana', 12_000);

			expect(state.ends).toEqual([
				['room-1', MeetWaitingRoomStatus.EXPIRED, { waitIds: ['wait-ana'], unseenFor: 10_000 }]
			]);
			expect(changed).toEqual([
				expect.objectContaining({
					status: MeetWaitingRoomStatus.EXPIRED,
					origin: MeetEventOrigin.SYSTEM,
					reason: MeetWaitingRoomReason.PAGE_CLOSED
				})
			]);
			expect(stateOf('wait-ana')).toEqual([
				{
					status: MeetWaitingRoomStatus.EXPIRED,
					origin: MeetEventOrigin.SYSTEM,
					reason: MeetWaitingRoomReason.PAGE_CLOSED
				}
			]);
		});

		it.each([
			[
				'endMeeting',
				(service: WaitingRoomService) => service.endMeeting('room-1', MeetEventOrigin.SYSTEM),
				MeetWaitingRoomStatus.MEETING_ENDED,
				MeetEventOrigin.SYSTEM,
				undefined
			],
			[
				'closeRoom',
				(service: WaitingRoomService) => service.closeRoom('room-1'),
				MeetWaitingRoomStatus.ROOM_CLOSED,
				MeetEventOrigin.MODERATOR,
				undefined
			],
			[
				'letEveryoneIn',
				(service: WaitingRoomService) => service.letEveryoneIn('room-1'),
				MeetWaitingRoomStatus.ADMITTED,
				MeetEventOrigin.MODERATOR,
				MeetWaitingRoomReason.WAITING_ROOM_DISABLED
			]
		])('%s ends every wait of the room', async (_name, run, outcome, origin, reason) => {
			const { service, state, changed } = build();
			state.endResult = { ended: [entry('ana')], silent: [], line: noLine };

			await run(service);

			expect(state.ends).toEqual([['room-1', outcome, { waitIds: undefined }]]);
			expect(changed).toEqual([expect.objectContaining({ status: outcome, origin })]);
			expect((changed[0] as { reason?: MeetWaitingRoomReason }).reason).toBe(reason);
		});
	});

	describe('a ticket asking for its token', () => {
		const wait = { waitId: 'wait-ana', roomId: 'room-1' } as WaitingRoomWait;

		it('uses the admission without telling anyone: participantJoined follows', async () => {
			const { service, changed, signals, states } = build();

			expect(await service.consume(wait)).toMatchObject({ entry: { used: true } });
			expect([changed, signals, states]).toEqual([[], [], []]);
		});

		it('back in line, is reported as waiting by the system and told its place', async () => {
			const { service, changed, stateOf } = build();

			await service.returnToLine(wait);

			expect(changed).toEqual([
				expect.objectContaining({ status: MeetWaitingRoomStatus.WAITING, origin: MeetEventOrigin.SYSTEM })
			]);
			expect(stateOf('wait-ana')).toEqual([
				{ status: MeetWaitingRoomStatus.WAITING, queuePosition: 1, waitedSeconds: 90 }
			]);
		});
	});

	describe('joined', () => {
		let built: ReturnType<typeof build>;

		beforeEach(() => {
			built = build();
		});

		it('tells the meeting that a place was released', async () => {
			await built.service.joined('room-1', 'ana');
			await built.service.joined('room-1', 'ben');

			expect(built.signals).toEqual(['room-1']);
		});

		it('never fails, since the sweep releases the place anyway', async () => {
			built.state.joinedFails = true;

			await expect(built.service.joined('room-1', 'ana')).resolves.toBeUndefined();
		});
	});

	it('finds the wait of a ticket by its hash, never by the ticket', async () => {
		const { service, state } = build();

		await service.findWait('a-ticket');

		expect(state.waitIdsLookedUp).toEqual([sha256('a-ticket')]);
	});

	it('keeps telling when a waiter cannot be reached', async () => {
		const { service, state, changed } = build();
		Object.assign((service as unknown as { webSocketService: object }).webSocketService, {
			send: jest.fn(async () => Promise.reject(new Error('Redis down')))
		});
		state.endResult = { ended: [entry('ana')], silent: [], line: noLine };

		await service.endWaits('room-1', MeetWaitingRoomStatus.ROOM_CLOSED, MeetEventOrigin.MODERATOR);

		expect(changed).toHaveLength(1);
	});
});
