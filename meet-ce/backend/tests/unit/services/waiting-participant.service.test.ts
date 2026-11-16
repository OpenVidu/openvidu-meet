import { ParticipantInfo_Kind } from '@livekit/protocol';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type {
	MeetWaitingParticipantStatusChangedPayload,
	MeetWaitingParticipantStatusChangedSignalPayload,
	MeetWaitingParticipantKnockedPayload
} from '@openvidu-meet/typings';
import {
	MEET_WAITING_PARTICIPANT_STATE_MESSAGE,
	MeetEventOrigin,
	MeetRoomMemberUIBadge,
	MeetWaitingParticipantType,
	MeetWaitingParticipantReason,
	MeetWaitingParticipantStatus
} from '@openvidu-meet/typings';
import { createHash } from 'crypto';
import type {
	WaitingDecisionResult,
	WaitingEndOptions,
	WaitingEndResult,
	WaitingEntry,
	WaitingKnockResult,
	ParticipantWait
} from '../../../src/models/waiting-participant.model.js';
import { MeetRoomMemberHelper } from '../../../src/helpers/room-member.helper.js';
import { WaitingParticipantAdmissionPolicy } from '../../../src/services/waiting-participants/waiting-participant-admission.policy.js';
import { WaitingParticipantService } from '../../../src/services/waiting-participants/waiting-participant.service.js';

const noopLogger = { info: () => {}, warn: () => {}, debug: () => {}, error: () => {}, verbose: () => {} };
const NOW = 1_800_000_000_000;
/** Lets the notifications sent in the background after a decision go out. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

const entry = (identity: string, overrides: Partial<WaitingEntry> = {}): WaitingEntry => ({
	waitId: `wait-${identity}`,
	participantIdentity: identity,
	participantName: identity.toUpperCase(),
	type: MeetWaitingParticipantType.ANONYMOUS,
	knockDate: NOW - 90_000,
	roomName: 'Room 1',
	status: MeetWaitingParticipantStatus.WAITING,
	...overrides
});

/** Answers each script with what the test sets, and records what it was asked. */
class FakeWaitingParticipantState {
	knockResult: WaitingKnockResult | null = { entry: entry('ana') };
	decideResult: WaitingDecisionResult = { decided: [] };
	decideFor: (participantIdentity?: string) => WaitingDecisionResult = () => this.decideResult;
	endResult: WaitingEndResult = { ended: [], silent: [] };
	entriesResult: WaitingEntry[] = [];
	wait: ParticipantWait | null = null;
	knocks: unknown[][] = [];
	decisions: unknown[][] = [];
	ends: [string, MeetWaitingParticipantStatus, WaitingEndOptions | undefined][] = [];
	waitIdsLookedUp: string[] = [];
	joinedFails = false;

	async knock(...args: unknown[]) {
		this.knocks.push(args);
		return this.knockResult;
	}

	async decide(...args: unknown[]) {
		this.decisions.push(args);
		return this.decideFor(args[2] as string | undefined);
	}

	async end(roomId: string, outcome: MeetWaitingParticipantStatus, options?: WaitingEndOptions) {
		this.ends.push([roomId, outcome, options]);
		return this.endResult;
	}

	async entries() {
		return this.entriesResult;
	}

	async entry(_roomId: string, identity: string) {
		return this.entriesResult.find(({ participantIdentity }) => participantIdentity === identity) ?? null;
	}

	async findWait(waitId: string) {
		this.waitIdsLookedUp.push(waitId);
		return this.wait;
	}

	async joined(_roomId: string, identity: string) {
		if (this.joinedFails) throw new Error('Redis down');

		return identity === 'ana' ? entry('ana', { status: MeetWaitingParticipantStatus.ADMITTED }) : null;
	}

	async consume() {
		return { entry: entry('ana', { status: MeetWaitingParticipantStatus.ADMITTED, used: true }) };
	}

	async returnToWaiting() {
		return { entry: entry('ana'), waitedSeconds: 90 };
	}
}

/** A participant in the meeting, holding `waitingParticipantAdmin` or not. */
const participantOf = (identity: string, kind: ParticipantInfo_Kind, waitingParticipantAdmin: boolean) => ({
	identity,
	kind,
	metadata: JSON.stringify({
		iat: NOW,
		roomId: 'room-1',
		permissions: { ...MeetRoomMemberHelper.allPermissions(), waitingParticipantAdmin },
		badge: MeetRoomMemberUIBadge.OTHER
	})
});

const build = ({
	maxParticipants = null as number | null,
	lockedEnabled = true,
	meetingRunning = true,
	connected = [
		participantOf('host', ParticipantInfo_Kind.STANDARD, true),
		participantOf('speaker', ParticipantInfo_Kind.STANDARD, false),
		participantOf('egress', ParticipantInfo_Kind.EGRESS, false)
	]
} = {}) => {
	const state = new FakeWaitingParticipantState();
	const states: [string, string, string, unknown][] = [];
	const signals: string[] = [];
	const knocked: MeetWaitingParticipantKnockedPayload[] = [];
	const changed: MeetWaitingParticipantStatusChangedPayload[] = [];
	const webhooks: string[] = [];
	const admitterSignals: [string[], MeetWaitingParticipantStatusChangedSignalPayload][] = [];
	const service = new WaitingParticipantService(
		...([
			{
				findByRoomId: async (roomId: string) =>
					roomId === 'missing'
						? null
						: { config: { maxParticipants }, access: { lock: { enabled: lockedEnabled } } }
			},
			{ roomExists: async () => meetingRunning, listRoomParticipants: async () => connected },
			state,
			new WaitingParticipantAdmissionPolicy(),
			{
				send: async (roomId: string, address: string, type: string, data: unknown) => {
					states.push([roomId, address, type, data]);
				}
			},
			{
				sendWaitingParticipantListUpdatedSignal: async (roomId: string) => signals.push(roomId),
				sendWaitingParticipantStatusChangedSignal: async (
					identities: string[],
					payload: MeetWaitingParticipantStatusChangedSignalPayload
				) => {
					admitterSignals.push([identities, payload]);
				}
			},
			{
				sendWaitingParticipantKnockedWebhook: (payload: MeetWaitingParticipantKnockedPayload) => {
					knocked.push(payload);
					webhooks.push('knocked');
				},
				sendWaitingParticipantStatusChangedWebhook: (payload: MeetWaitingParticipantStatusChangedPayload) => {
					changed.push(payload);
					webhooks.push(payload.status);
				}
			},
			noopLogger
		] as unknown as ConstructorParameters<typeof WaitingParticipantService>)
	);
	const stateOf = (waitId: string) => states.filter(([, address]) => address === waitId).map(([, , , data]) => data);
	return { service, state, states, stateOf, signals, knocked, changed, webhooks, admitterSignals };
};

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

describe('WaitingParticipantService', () => {
	describe('knock', () => {
		it('answers a ticket whose hash is the wait, and the participant, with the type and principal from the credential', async () => {
			const { service, state } = build();
			state.knockResult = {
				entry: entry('guest-1', {
					participantName: 'Ana',
					type: MeetWaitingParticipantType.IDENTIFIED_GUEST,
					externalId: 'u-42'
				})
			};

			const answer = await service.knock(
				{ roomId: 'room-1', roomName: 'Room 1' },
				{ participantIdentity: 'guest-1', participantName: 'Ana', externalId: 'u-42', memberId: 'guest-1' }
			);

			expect(answer.participant).toEqual({
				participantIdentity: 'guest-1',
				participantName: 'Ana',
				type: MeetWaitingParticipantType.IDENTIFIED_GUEST,
				externalId: 'u-42',
				knockDate: NOW - 90_000
			});
			expect(answer.waitingTicket).toMatch(/^[A-Za-z0-9_-]{22}$/);
			expect(state.knocks).toEqual([
				[
					'room-1',
					sha256(answer.waitingTicket),
					{
						participantIdentity: 'guest-1',
						participantName: 'Ana',
						type: MeetWaitingParticipantType.IDENTIFIED_GUEST,
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
						type: MeetWaitingParticipantType.ANONYMOUS,
						knockDate: NOW - 90_000
					}
				}
			]);
			expect(signals).toEqual(['room-1']);
			expect(changed).toEqual([]);
		});

		it('ends the earlier wait of the same identity as left, telling it and the webhooks before the new knock', async () => {
			const { service, state, stateOf, changed, webhooks } = build();
			state.knockResult = { entry: entry('ana', { waitId: 'wait-new' }), replaced: entry('ana') };

			await service.knock(
				{ roomId: 'room-1', roomName: 'Room 1' },
				{ participantIdentity: 'ana', participantName: 'Ana' }
			);

			expect(stateOf('wait-ana')).toEqual([
				{
					status: MeetWaitingParticipantStatus.LEFT,
					origin: MeetEventOrigin.PARTICIPANT,
					reason: MeetWaitingParticipantReason.REPLACED
				}
			]);
			expect(changed).toEqual([
				expect.objectContaining({
					status: MeetWaitingParticipantStatus.LEFT,
					origin: MeetEventOrigin.PARTICIPANT,
					reason: MeetWaitingParticipantReason.REPLACED
				})
			]);
			expect(webhooks).toEqual([MeetWaitingParticipantStatus.LEFT, 'knocked']);
		});

		it('refuses a knock when the waiting list is full', async () => {
			const { service, state, knocked } = build();
			state.knockResult = null;

			await expect(
				service.knock(
					{ roomId: 'room-1', roomName: 'Room 1' },
					{ participantIdentity: 'ana', participantName: 'Ana' }
				)
			).rejects.toMatchObject({
				statusCode: 409,
				message: "Room 'room-1' already has as many waiting participants as it can hold"
			});
			expect(knocked).toEqual([]);
		});
	});

	describe('the other waiters', () => {
		it('are told nothing when a wait ends', async () => {
			const { service, state, states } = build();
			state.endResult = { ended: [entry('ana')], silent: [] };

			await service.endWaits('room-1', MeetWaitingParticipantStatus.LEFT, MeetEventOrigin.PARTICIPANT, [
				'wait-ana'
			]);

			expect(states).toEqual([
				[
					'room-1',
					'wait-ana',
					MEET_WAITING_PARTICIPANT_STATE_MESSAGE,
					{ status: MeetWaitingParticipantStatus.LEFT, origin: MeetEventOrigin.PARTICIPANT }
				]
			]);
		});
	});

	describe('list', () => {
		it('lists those waiting, leaving out the admitted ones', async () => {
			const { service, state } = build({ maxParticipants: 5 });
			state.entriesResult = [
				entry('zoe', { knockDate: NOW }),
				entry('ben', { status: MeetWaitingParticipantStatus.ADMITTED, used: true }),
				entry('ana', { knockDate: NOW - 1 })
			];

			const list = await service.list('room-1');

			expect(list).toEqual({
				participants: [
					expect.objectContaining({ participantIdentity: 'zoe' }),
					{
						participantIdentity: 'ana',
						participantName: 'ANA',
						type: MeetWaitingParticipantType.ANONYMOUS,
						knockDate: NOW - 1
					}
				]
			});
		});

		it('is empty in an unlocked room', async () => {
			const { service, state } = build({ lockedEnabled: false });
			state.entriesResult = [entry('ana')];

			expect((await service.list('room-1')).participants).toEqual([]);
		});

		it('answers 404 for a room that does not exist', async () => {
			await expect(build().service.list('missing')).rejects.toMatchObject({ statusCode: 404 });
		});
	});

	describe('get', () => {
		it('answers a participant who waits', async () => {
			const { service, state } = build();
			state.entriesResult = [entry('ana')];

			expect(await service.get('room-1', 'ana')).toMatchObject({ participantIdentity: 'ana' });
		});

		it('answers 404 for an admitted participant, an unknown one and any in an unlocked room', async () => {
			const { service, state } = build();
			state.entriesResult = [entry('ben', { status: MeetWaitingParticipantStatus.ADMITTED })];

			for (const identity of ['ben', 'zoe']) {
				await expect(service.get('room-1', identity)).rejects.toMatchObject({
					statusCode: 404,
					fields: { participantIdentity: identity }
				});
			}

			const unlocked = build({ lockedEnabled: false });
			unlocked.state.entriesResult = [entry('ana')];
			await expect(unlocked.service.get('room-1', 'ana')).rejects.toMatchObject({ statusCode: 404 });
		});
	});

	describe('admit and reject', () => {
		it('admits within the capacity the meeting has, counting only people', async () => {
			const { service, state } = build({ maxParticipants: 5 });

			await service.admit('room-1', 'ana');
			await service.admit('room-1');

			expect(state.decisions).toEqual([
				['room-1', 'admit', 'ana', 3],
				['room-1', 'admit', undefined, 3]
			]);
		});

		it('tells each admitted participant, the webhooks as a moderator decision, and the meeting', async () => {
			const { service, state, stateOf, changed, signals } = build();
			state.decideResult = { decided: [entry('ana', { status: MeetWaitingParticipantStatus.ADMITTED })] };

			await service.admit('room-1');

			expect(stateOf('wait-ana')).toEqual([
				{ status: MeetWaitingParticipantStatus.ADMITTED, origin: MeetEventOrigin.MODERATOR }
			]);
			expect(changed).toEqual([
				expect.objectContaining({
					roomId: 'room-1',
					roomName: 'Room 1',
					status: MeetWaitingParticipantStatus.ADMITTED,
					origin: MeetEventOrigin.MODERATOR
				})
			]);
			expect(signals).toEqual(['room-1']);
		});

		it('tells each change, one by one, only to the participants in the meeting who hold waitingParticipantAdmin', async () => {
			const { service, state, admitterSignals } = build();
			state.decideResult = {
				decided: [
					entry('ana', { status: MeetWaitingParticipantStatus.ADMITTED }),
					entry('ben', { status: MeetWaitingParticipantStatus.ADMITTED })
				]
			};

			await service.admit('room-1');
			await flush();

			expect(admitterSignals).toEqual([
				[
					['host'],
					expect.objectContaining({
						roomId: 'room-1',
						participant: expect.objectContaining({ participantIdentity: 'ana' }),
						status: MeetWaitingParticipantStatus.ADMITTED,
						origin: MeetEventOrigin.MODERATOR
					})
				],
				[
					['host'],
					expect.objectContaining({ participant: expect.objectContaining({ participantIdentity: 'ben' }) })
				]
			]);
			expect(admitterSignals[0][1]).not.toHaveProperty('roomName');
		});

		it('tells no admitter when no meeting runs or nobody in it may admit', async () => {
			const noMeeting = build({ meetingRunning: false });
			const noAdmitter = build({ connected: [participantOf('speaker', ParticipantInfo_Kind.STANDARD, false)] });

			for (const { service, state } of [noMeeting, noAdmitter]) {
				state.decideResult = { decided: [entry('ana', { status: MeetWaitingParticipantStatus.ADMITTED })] };
				await service.admit('room-1');
			}

			await flush();

			expect(noMeeting.admitterSignals).toEqual([]);
			expect(noAdmitter.admitterSignals).toEqual([]);
		});

		it('answers 404 naming the participant that no longer waits, and 409 when not everyone fits', async () => {
			const { service, state } = build({ maxParticipants: 3 });
			state.decideResult = { notWaiting: 'ben' };

			await expect(service.reject('room-1', 'ben')).rejects.toMatchObject({
				statusCode: 404,
				message: "Participant 'ben' is not waiting in room 'room-1'",
				fields: { participantIdentity: 'ben' }
			});

			state.decideResult = { noPlaces: true };

			await expect(service.admit('room-1')).rejects.toMatchObject({
				statusCode: 409,
				message: "The meeting of room 'room-1' has fewer free places than participants to admit",
				fields: {}
			});
		});

		it('in an unlocked room, answers 404 for a named participant and nobody for everyone waiting', async () => {
			const { service, state } = build({ lockedEnabled: false });

			await expect(service.admit('room-1', 'ana')).rejects.toMatchObject({ statusCode: 404 });
			await expect(service.reject('room-1', 'ana')).rejects.toMatchObject({ statusCode: 404 });
			await expect(service.admit('room-1')).resolves.toBeUndefined();
			expect(state.decisions).toEqual([]);
		});
	});

	describe('bulkReject', () => {
		it('rejects each participant named on their own, failing alone those who do not wait', async () => {
			const { service, state, stateOf, changed, signals } = build({ maxParticipants: 3 });
			state.decideFor = (identity) =>
				identity === 'ben' ? { notWaiting: 'ben' } : { decided: [entry(identity!)] };

			expect(await service.bulkReject('room-1', ['ana', 'ben', 'zoe'])).toEqual({
				rejected: ['ana', 'zoe'],
				failed: [{ participantIdentity: 'ben', error: "Participant 'ben' is not waiting in room 'room-1'" }]
			});
			expect(state.decisions).toEqual([
				['room-1', 'reject', 'ana', null],
				['room-1', 'reject', 'ben', null],
				['room-1', 'reject', 'zoe', null]
			]);
			expect(stateOf('wait-ana')).toEqual([
				{ status: MeetWaitingParticipantStatus.REJECTED, origin: MeetEventOrigin.MODERATOR }
			]);
			expect(changed.map(({ participant, status }) => [participant.participantIdentity, status])).toEqual([
				['ana', MeetWaitingParticipantStatus.REJECTED],
				['zoe', MeetWaitingParticipantStatus.REJECTED]
			]);
			expect(signals).toEqual(['room-1']);
		});

		it('tells nobody when none of those named waits', async () => {
			const { service, state, signals, changed } = build();
			state.decideFor = (identity) => ({ notWaiting: identity! });

			const { rejected, failed } = await service.bulkReject('room-1', ['ana', 'ben']);

			expect(rejected).toEqual([]);
			expect(failed.map(({ participantIdentity }) => participantIdentity)).toEqual(['ana', 'ben']);
			expect(signals).toEqual([]);
			expect(changed).toEqual([]);
		});

		it('fails everyone named in an unlocked room without running the script, and answers 404 for no room', async () => {
			const unlocked = build({ lockedEnabled: false });

			expect((await unlocked.service.bulkReject('room-1', ['ana'])).failed).toEqual([
				{ participantIdentity: 'ana', error: "Participant 'ana' is not waiting in room 'room-1'" }
			]);
			expect(unlocked.state.decisions).toEqual([]);
			await expect(build().service.bulkReject('missing', ['ana'])).rejects.toMatchObject({ statusCode: 404 });
		});
	});

	describe('ending waits', () => {
		it('leaves a wait of the room of the request, as the participant', async () => {
			const { service, state } = build();
			state.wait = {
				waitId: 'wait-ana',
				roomId: 'room-1',
				status: MeetWaitingParticipantStatus.WAITING,
				ended: false
			} as ParticipantWait;

			await service.leave('room-1', 'ticket-of-ana');

			expect(state.waitIdsLookedUp).toEqual([sha256('ticket-of-ana')]);
			expect(state.ends).toEqual([['room-1', MeetWaitingParticipantStatus.LEFT, { waitIds: ['wait-ana'] }]]);
		});

		it('expires the wait of a page that closed, as the system', async () => {
			const { service, state, changed } = build();
			state.wait = {
				waitId: 'wait-ana',
				roomId: 'room-1',
				status: MeetWaitingParticipantStatus.WAITING,
				ended: false
			} as ParticipantWait;
			state.endResult = { ended: [entry('ana')], silent: [] };

			await service.leave('room-1', 'ticket-of-ana', MeetWaitingParticipantReason.PAGE_CLOSED);

			expect(state.ends).toEqual([['room-1', MeetWaitingParticipantStatus.EXPIRED, { waitIds: ['wait-ana'] }]]);
			expect(changed).toEqual([
				expect.objectContaining({
					status: MeetWaitingParticipantStatus.EXPIRED,
					origin: MeetEventOrigin.SYSTEM,
					reason: MeetWaitingParticipantReason.PAGE_CLOSED
				})
			]);
		});

		it('changes nothing for a ticket of another room, an ended wait or an unknown one', async () => {
			const { service, state } = build();

			state.wait = { waitId: 'wait-ana', roomId: 'room-2', ended: false } as ParticipantWait;
			await service.leave('room-1', 'ticket');
			state.wait = { waitId: 'wait-ana', roomId: 'room-1', ended: true } as ParticipantWait;
			await service.leave('room-1', 'ticket');
			state.wait = null;
			await service.leave('room-1', 'ticket');

			expect(state.ends).toEqual([]);
		});

		it('expires only waits still unseen, used admissions silently, telling why each one expired', async () => {
			const { service, state, changed, stateOf } = build();
			state.endResult = {
				ended: [entry('ana'), entry('cleo', { status: MeetWaitingParticipantStatus.ADMITTED })],
				silent: [entry('ben', { status: MeetWaitingParticipantStatus.ADMITTED, used: true })]
			};

			await service.expire('room-1', ['wait-ana', 'wait-ben']);

			expect(state.ends).toEqual([
				[
					'room-1',
					MeetWaitingParticipantStatus.EXPIRED,
					{ waitIds: ['wait-ana', 'wait-ben'], includeUsed: true, unseenFor: 60_000 }
				]
			]);
			expect(changed).toEqual([
				expect.objectContaining({
					participant: expect.objectContaining({ participantIdentity: 'ana' }),
					status: MeetWaitingParticipantStatus.EXPIRED,
					origin: MeetEventOrigin.SYSTEM,
					reason: MeetWaitingParticipantReason.CONNECTION_LOST
				}),
				expect.objectContaining({
					participant: expect.objectContaining({ participantIdentity: 'cleo' }),
					reason: MeetWaitingParticipantReason.ADMISSION_UNUSED
				})
			]);
			expect(stateOf('wait-ben')).toEqual([]);
		});

		it.each([
			[
				'endMeeting',
				(service: WaitingParticipantService) => service.endMeeting('room-1', MeetEventOrigin.SYSTEM),
				MeetWaitingParticipantStatus.MEETING_ENDED,
				MeetEventOrigin.SYSTEM,
				undefined
			],
			[
				'closeRoom',
				(service: WaitingParticipantService) => service.closeRoom('room-1'),
				MeetWaitingParticipantStatus.ROOM_CLOSED,
				MeetEventOrigin.MODERATOR,
				undefined
			],
			[
				'letEveryoneIn',
				(service: WaitingParticipantService) => service.letEveryoneIn('room-1'),
				MeetWaitingParticipantStatus.ADMITTED,
				MeetEventOrigin.MODERATOR,
				MeetWaitingParticipantReason.ROOM_UNLOCKED
			]
		])('%s ends every wait of the room', async (_name, run, outcome, origin, reason) => {
			const { service, state, changed } = build();
			state.endResult = { ended: [entry('ana')], silent: [] };

			await run(service);

			expect(state.ends).toEqual([['room-1', outcome, { waitIds: undefined }]]);
			expect(changed).toEqual([expect.objectContaining({ status: outcome, origin })]);
			expect((changed[0] as { reason?: MeetWaitingParticipantReason }).reason).toBe(reason);
		});
	});

	describe('a ticket asking for its token', () => {
		const wait = { waitId: 'wait-ana', roomId: 'room-1' } as ParticipantWait;

		it('uses the admission without telling anyone: participantJoined follows', async () => {
			const { service, changed, signals, states } = build();

			expect(await service.consume(wait)).toMatchObject({ entry: { used: true } });
			expect([changed, signals, states]).toEqual([[], [], []]);
		});

		it('waiting again, is reported as waiting by the system and told so', async () => {
			const { service, changed, stateOf, signals } = build();

			await service.returnToWaiting(wait);

			expect(changed).toEqual([
				expect.objectContaining({
					status: MeetWaitingParticipantStatus.WAITING,
					origin: MeetEventOrigin.SYSTEM
				})
			]);
			expect(stateOf('wait-ana')).toEqual([{ status: MeetWaitingParticipantStatus.WAITING, waitedSeconds: 90 }]);
			expect(signals).toEqual(['room-1']);
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
		state.endResult = { ended: [entry('ana')], silent: [] };

		await service.endWaits('room-1', MeetWaitingParticipantStatus.ROOM_CLOSED, MeetEventOrigin.MODERATOR);

		expect(changed).toHaveLength(1);
	});
});
