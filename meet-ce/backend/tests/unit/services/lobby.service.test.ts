import { ParticipantInfo_Kind } from '@livekit/protocol';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { MeetLobbyStatusChangedPayload, MeetParticipantKnockedPayload } from '@openvidu-meet/typings';
import {
	MEET_LOBBY_STATE_MESSAGE,
	MeetEventOrigin,
	MeetLobbyParticipantType,
	MeetLobbyStatus
} from '@openvidu-meet/typings';
import { createHash } from 'crypto';
import type {
	LobbyDecisionResult,
	LobbyEndOptions,
	LobbyEndResult,
	LobbyEntry,
	LobbyKnockResult,
	LobbyLine,
	LobbyWait
} from '../../../src/models/lobby.model.js';
import { LobbyAdmissionPolicy } from '../../../src/services/lobby/lobby-admission.policy.js';
import { LobbyService } from '../../../src/services/lobby/lobby.service.js';

const noopLogger = { info: () => {}, warn: () => {}, debug: () => {}, error: () => {}, verbose: () => {} };
const NOW = 1_800_000_000_000;
const noLine: LobbyLine = { now: NOW, from: 1, waiting: [] };

const entry = (identity: string, overrides: Partial<LobbyEntry> = {}): LobbyEntry => ({
	waitId: `wait-${identity}`,
	participantIdentity: identity,
	participantName: identity.toUpperCase(),
	type: MeetLobbyParticipantType.ANONYMOUS,
	knockDate: NOW - 90_000,
	roomName: 'Room 1',
	status: MeetLobbyStatus.WAITING,
	...overrides
});

/** Answers each script with what the test sets, and records what it was asked. */
class FakeLobbyState {
	knockResult: LobbyKnockResult | null = { entry: entry('ana'), line: noLine };
	decideResult: LobbyDecisionResult = { decided: [], line: noLine };
	endResult: LobbyEndResult = { ended: [], silent: [], line: noLine };
	entriesResult: LobbyEntry[] = [];
	wait: LobbyWait | null = null;
	knocks: unknown[][] = [];
	decisions: unknown[][] = [];
	ends: [string, MeetLobbyStatus, LobbyEndOptions | undefined][] = [];
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

	async end(roomId: string, outcome: MeetLobbyStatus, options?: LobbyEndOptions) {
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

		return identity === 'ana' ? entry('ana', { status: MeetLobbyStatus.ADMITTED }) : null;
	}

	async consume() {
		return { entry: entry('ana', { status: MeetLobbyStatus.ADMITTED, used: true }) };
	}

	async returnToLine() {
		return { entry: entry('ana'), line: { now: NOW, from: 1, waiting: [['wait-ana', NOW - 90_000]] } };
	}
}

const build = ({
	maxParticipants = null as number | null,
	lobbyEnabled = true,
	connected = [ParticipantInfo_Kind.STANDARD, ParticipantInfo_Kind.STANDARD, ParticipantInfo_Kind.EGRESS]
} = {}) => {
	const state = new FakeLobbyState();
	const states: [string, string, string, unknown][] = [];
	const signals: string[] = [];
	const knocked: MeetParticipantKnockedPayload[] = [];
	const changed: MeetLobbyStatusChangedPayload[] = [];
	const service = new LobbyService(
		...([
			{
				findByRoomId: async (roomId: string) =>
					roomId === 'missing' ? null : { config: { maxParticipants, lobby: { enabled: lobbyEnabled } } }
			},
			{ listRoomParticipants: async () => connected.map((kind) => ({ kind })) },
			state,
			new LobbyAdmissionPolicy(),
			{
				send: async (roomId: string, address: string, type: string, data: unknown) => {
					states.push([roomId, address, type, data]);
				}
			},
			{ sendLobbyUpdatedSignal: async (roomId: string) => signals.push(roomId) },
			{
				sendParticipantKnockedWebhook: (payload: MeetParticipantKnockedPayload) => knocked.push(payload),
				sendLobbyStatusChangedWebhook: (payload: MeetLobbyStatusChangedPayload) => changed.push(payload)
			},
			noopLogger
		] as unknown as ConstructorParameters<typeof LobbyService>)
	);
	const stateOf = (waitId: string) => states.filter(([, address]) => address === waitId).map(([, , , data]) => data);
	return { service, state, states, stateOf, signals, knocked, changed };
};

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

describe('LobbyService', () => {
	describe('knock', () => {
		it('answers a ticket whose hash is the wait, and the identity, with the type and principal from the credential', async () => {
			const { service, state } = build();

			const answer = await service.knock(
				{ roomId: 'room-1', roomName: 'Room 1' },
				{ participantIdentity: 'guest-1', participantName: 'Ana', externalId: 'u-42', memberId: 'guest-1' }
			);

			expect(answer.participantIdentity).toBe('guest-1');
			expect(answer.lobbyTicket).toMatch(/^[A-Za-z0-9_-]{22}$/);
			expect(state.knocks).toEqual([
				[
					'room-1',
					sha256(answer.lobbyTicket),
					{
						participantIdentity: 'guest-1',
						participantName: 'Ana',
						type: MeetLobbyParticipantType.IDENTIFIED_GUEST,
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
						type: MeetLobbyParticipantType.ANONYMOUS,
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

			expect(stateOf('wait-ana')).toEqual([{ status: MeetLobbyStatus.LEFT }]);
			expect(changed).toEqual([
				expect.objectContaining({ status: MeetLobbyStatus.LEFT, origin: MeetEventOrigin.PARTICIPANT })
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

			await service.endWaits('room-1', MeetLobbyStatus.LEFT, MeetEventOrigin.PARTICIPANT, ['wait-ana']);

			expect(states).toEqual([
				['room-1', 'wait-ana', MEET_LOBBY_STATE_MESSAGE, { status: MeetLobbyStatus.LEFT }],
				[
					'room-1',
					'wait-ben',
					MEET_LOBBY_STATE_MESSAGE,
					{ status: MeetLobbyStatus.WAITING, queuePosition: 1, waitedSeconds: 61 }
				]
			]);
		});
	});

	describe('list', () => {
		it('lists those waiting in arrival order, and the free places counting the admitted ones', async () => {
			const { service, state } = build({ maxParticipants: 5 });
			state.entriesResult = [
				entry('zoe', { knockDate: NOW }),
				entry('ben', { status: MeetLobbyStatus.ADMITTED, used: true }),
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
				type: MeetLobbyParticipantType.ANONYMOUS,
				knockDate: NOW - 1
			});
			expect(list.availablePlaces).toBe(2);
		});

		it('never answers fewer than no free places, and none without a limit', async () => {
			const full = build({ maxParticipants: 2 });
			full.state.entriesResult = [entry('ana', { status: MeetLobbyStatus.ADMITTED })];

			expect((await full.service.list('room-1')).availablePlaces).toBe(0);
			expect((await build().service.list('room-1')).availablePlaces).toBeNull();
		});

		it('is empty with the waiting room off', async () => {
			const { service, state } = build({ lobbyEnabled: false });
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
				decided: [entry('ana', { status: MeetLobbyStatus.ADMITTED })],
				line: { now: NOW, from: 1, waiting: [['wait-ben', NOW]] }
			};

			const admitted = await service.admit('room-1');

			expect(admitted.map(({ participantIdentity }) => participantIdentity)).toEqual(['ana']);
			expect(stateOf('wait-ana')).toEqual([{ status: MeetLobbyStatus.ADMITTED }]);
			expect(stateOf('wait-ben')).toEqual([
				{ status: MeetLobbyStatus.WAITING, queuePosition: 1, waitedSeconds: 0 }
			]);
			expect(changed).toEqual([
				expect.objectContaining({
					roomId: 'room-1',
					roomName: 'Room 1',
					status: MeetLobbyStatus.ADMITTED,
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
			const { service, state } = build({ lobbyEnabled: false });

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
				status: MeetLobbyStatus.WAITING,
				ended: false
			} as LobbyWait;

			await service.leave('room-1', 'ticket-of-ana');

			expect(state.waitIdsLookedUp).toEqual([sha256('ticket-of-ana')]);
			expect(state.ends).toEqual([['room-1', MeetLobbyStatus.LEFT, { waitIds: ['wait-ana'] }]]);
		});

		it('changes nothing for a ticket of another room, an ended wait or an unknown one', async () => {
			const { service, state } = build();

			state.wait = { waitId: 'wait-ana', roomId: 'room-2', ended: false } as LobbyWait;
			await service.leave('room-1', 'ticket');
			state.wait = { waitId: 'wait-ana', roomId: 'room-1', ended: true } as LobbyWait;
			await service.leave('room-1', 'ticket');
			state.wait = null;
			await service.leave('room-1', 'ticket');

			expect(state.ends).toEqual([]);
		});

		it('expires only waits still unseen, used admissions silently', async () => {
			const { service, state, changed, stateOf } = build();
			state.endResult = {
				ended: [entry('ana')],
				silent: [entry('ben', { status: MeetLobbyStatus.ADMITTED, used: true })],
				line: noLine
			};

			await service.expire('room-1', ['wait-ana', 'wait-ben']);

			expect(state.ends).toEqual([
				[
					'room-1',
					MeetLobbyStatus.EXPIRED,
					{ waitIds: ['wait-ana', 'wait-ben'], includeUsed: true, unseenFor: 60_000 }
				]
			]);
			expect(changed).toEqual([
				expect.objectContaining({
					participant: expect.objectContaining({ participantIdentity: 'ana' }),
					status: MeetLobbyStatus.EXPIRED,
					origin: MeetEventOrigin.SYSTEM
				})
			]);
			expect(stateOf('wait-ben')).toEqual([]);
		});

		it.each([
			[
				'endMeeting',
				(service: LobbyService) => service.endMeeting('room-1', MeetEventOrigin.SYSTEM),
				MeetLobbyStatus.MEETING_ENDED,
				MeetEventOrigin.SYSTEM
			],
			[
				'closeRoom',
				(service: LobbyService) => service.closeRoom('room-1'),
				MeetLobbyStatus.ROOM_CLOSED,
				MeetEventOrigin.MODERATOR
			],
			[
				'letEveryoneIn',
				(service: LobbyService) => service.letEveryoneIn('room-1'),
				MeetLobbyStatus.ADMITTED,
				MeetEventOrigin.MODERATOR
			]
		])('%s ends every wait of the room', async (_name, run, outcome, origin) => {
			const { service, state, changed } = build();
			state.endResult = { ended: [entry('ana')], silent: [], line: noLine };

			await run(service);

			expect(state.ends).toEqual([['room-1', outcome, { waitIds: undefined }]]);
			expect(changed).toEqual([expect.objectContaining({ status: outcome, origin })]);
		});
	});

	describe('a ticket asking for its token', () => {
		const wait = { waitId: 'wait-ana', roomId: 'room-1' } as LobbyWait;

		it('uses the admission without telling anyone: participantJoined follows', async () => {
			const { service, changed, signals, states } = build();

			expect(await service.consume(wait)).toMatchObject({ entry: { used: true } });
			expect([changed, signals, states]).toEqual([[], [], []]);
		});

		it('back in line, is reported as waiting by the system and told its place', async () => {
			const { service, changed, stateOf } = build();

			await service.returnToLine(wait);

			expect(changed).toEqual([
				expect.objectContaining({ status: MeetLobbyStatus.WAITING, origin: MeetEventOrigin.SYSTEM })
			]);
			expect(stateOf('wait-ana')).toEqual([
				{ status: MeetLobbyStatus.WAITING, queuePosition: 1, waitedSeconds: 90 }
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

		await service.endWaits('room-1', MeetLobbyStatus.ROOM_CLOSED, MeetEventOrigin.MODERATOR);

		expect(changed).toHaveLength(1);
	});
});
