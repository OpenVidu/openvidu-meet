import { afterAll, afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import type {
	MeetWaitingRoomParticipant,
	MeetWaitingRoomState,
	MeetWaitingRoomTicketResponse,
	MeetWebSocketMessage
} from '@openvidu-meet/typings';
import {
	MEET_WAITING_ROOM_STATE_MESSAGE,
	MeetWaitingRoomParticipantType,
	MeetWaitingRoomStatus,
	MeetRoomMemberRole,
	MeetRoomStatus,
	MeetWebSocketCloseCode
} from '@openvidu-meet/typings';
import express from 'express';
import http from 'http';
import { jwtDecode } from 'jwt-decode';
import type { ClaimGrants } from 'livekit-server-sdk';
import type { AddressInfo } from 'net';
import { WebSocket } from 'ws';
import { container } from '../../../../src/config/dependency-injector.config.js';
import { INTERNAL_CONFIG } from '../../../../src/config/internal-config.js';
import { webSocketHandshakeGuard } from '../../../../src/middlewares/rate-limit.middleware.js';
import { RoomRepository } from '../../../../src/repositories/room.repository.js';
import { LiveKitService } from '../../../../src/services/livekit.service.js';
import { WaitingRoomRealtimeHandler } from '../../../../src/services/waiting-room/waiting-room-realtime.handler.js';
import { WaitingRoomStateService } from '../../../../src/services/waiting-room/waiting-room-state.service.js';
import { WaitingRoomService } from '../../../../src/services/waiting-room/waiting-room.service.js';
import { LoggerService } from '../../../../src/services/logger.service.js';
import { RedisService } from '../../../../src/services/redis.service.js';
import { RequestSessionService } from '../../../../src/services/request-session.service.js';
import { WebSocketService } from '../../../../src/services/websocket.service.js';
import {
	disconnectFakeParticipants,
	joinFakeParticipant,
	joinFakeParticipantUntilRemoved
} from '../../../helpers/livekit-cli-helpers.js';
import {
	admitFromWaitingRoom,
	askToJoin,
	deleteAllRooms,
	deleteRoom,
	endMeeting,
	getWaitingRoom,
	getRoom,
	kickParticipant,
	leaveWaitingRoom,
	rejectFromWaitingRoom,
	startTestServer,
	updateRoomConfig,
	updateRoomRoles,
	updateRoomStatus
} from '../../../helpers/request-helpers.js';
import { guestSecretOf, setupRoomMember, setupSingleRoom } from '../../../helpers/test-scenarios.js';
import { waitForMeetingToEnd, waitForMeetingToStart } from '../../../helpers/wait-helpers.js';
import type { RoomData } from '../../../interfaces/scenarios.js';

const setupWaitingRoomRoom = (maxParticipants: number | null = null, withParticipant = false) =>
	setupSingleRoom(withParticipant, 'WAITING_ROOM_ROOM', { waitingRoom: { enabled: true }, maxParticipants });

/** Asks to join with the room's speaker link, which has no waitingRoomBypass, and answers the ticket. */
const knock = async (roomData: RoomData, name: string, secret = roomData.speakerSecret) => {
	const response = await askToJoin(roomData.room.roomId, secret, name);
	expect(response.status).toBe(202);
	const { waitingRoomTicket, participant } = response.body as MeetWaitingRoomTicketResponse;
	return { waitingRoomTicket, participant, participantIdentity: participant.participantIdentity };
};

const identityOf = (token: string) => jwtDecode<ClaimGrants>(token).sub;

const waiting = async (roomId: string) => {
	const response = await getWaitingRoom(roomId);
	expect(response.status).toBe(200);
	return (response.body.participants as MeetWaitingRoomParticipant[]).map(({ participantName }) => participantName);
};

/** Starts the meeting of a room through a holder of waitingRoomBypass, who joins it, and answers their join token. */
const startMeetingAsModerator = async (roomData: RoomData) => {
	const response = await askToJoin(roomData.room.roomId, roomData.moderatorSecret, 'Host');
	expect(response.status).toBe(200);
	const token: string = response.body.token;
	const { sub, metadata } = jwtDecode<ClaimGrants>(token);
	await joinFakeParticipant(roomData.room.roomId, sub!, metadata);
	await waitForMeetingToStart(roomData.room.roomId);
	return { token: `Bearer ${token}`, identity: sub! };
};

const deleteMeetingRoom = async (roomId: string) => {
	await container.get(LiveKitService).deleteRoom(roomId);
	await waitForMeetingToEnd(roomId);
};

const expectWaitEnded = (response: { status: number; body: { status?: string } }, status?: MeetWaitingRoomStatus) => {
	expect(response.status).toBe(409);
	expect(response.body).toMatchObject({ error: 'wait_ended', message: 'The wait has ended' });
	expect(response.body.status).toBe(status);
};

describe('Waiting room', () => {
	beforeAll(async () => {
		await startTestServer();
	});

	afterAll(async () => {
		await disconnectFakeParticipants();
		await deleteAllRooms();
	});

	describe('Asking to join', () => {
		it('answers a ticket and the identity listed to whoever lacks waitingRoomBypass, without starting the meeting', async () => {
			const roomData = await setupWaitingRoomRoom();
			const { roomId } = roomData.room;

			const { waitingRoomTicket, participantIdentity } = await knock(roomData, 'Ana');

			expect(waitingRoomTicket).toEqual(expect.any(String));
			expect(participantIdentity).toMatch(/^ana-/);
			const waitingRoom = await getWaitingRoom(roomId);
			expect(waitingRoom.body).toEqual({
				participants: [
					{
						participantIdentity,
						participantName: 'Ana',
						type: MeetWaitingRoomParticipantType.ANONYMOUS,
						knockDate: expect.any(Number)
					}
				],
				availablePlaces: null
			});
			expect((await getRoom(roomId)).body.status).toBe(MeetRoomStatus.OPEN);
			expect(await container.get(LiveKitService).roomExists(roomId)).toBe(false);
		});

		it('gives a holder of waitingRoomBypass a join token at once', async () => {
			const roomData = await setupWaitingRoomRoom();

			const response = await askToJoin(roomData.room.roomId, roomData.moderatorSecret, 'Host');

			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty('token');
		});

		it('refuses the ticket as a room member token', async () => {
			const roomData = await setupWaitingRoomRoom();
			const { waitingRoomTicket } = await knock(roomData, 'Ana');

			expect((await getWaitingRoom(roomData.room.roomId, waitingRoomTicket)).status).toBe(401);
			expect((await getRoom(roomData.room.roomId, undefined, undefined, waitingRoomTicket)).status).toBe(401);
		});

		it('lets a participant wait in a full meeting', async () => {
			const roomData = await setupWaitingRoomRoom(1, true);

			await knock(roomData, 'Ana');

			expect(await waiting(roomData.room.roomId)).toEqual(['Ana']);
		});

		it('binds the ticket of a personal link to its member, and lists them as an identified guest', async () => {
			const roomData = await setupWaitingRoomRoom();
			const { roomId } = roomData.room;
			const [ana, bob] = await Promise.all(
				['Ana', 'Bob'].map((name) => setupRoomMember(roomId, { name, baseRole: MeetRoomMemberRole.SPEAKER }))
			);

			const { waitingRoomTicket, participantIdentity } = await knock(roomData, 'Ana', guestSecretOf(ana!.member));

			expect(participantIdentity).toBe(ana!.member.memberId);
			expect((await getWaitingRoom(roomId)).body.participants[0].type).toBe(
				MeetWaitingRoomParticipantType.IDENTIFIED_GUEST
			);
			const withBobsLink = await askToJoin(roomId, guestSecretOf(bob!.member), 'Bob', waitingRoomTicket);
			expect(withBobsLink.status).toBe(403);
		});

		it('ends the earlier wait of the same identity as left, and puts the new one at the end of the line', async () => {
			const roomData = await setupWaitingRoomRoom();
			const { roomId } = roomData.room;
			const { member } = await setupRoomMember(roomId, { name: 'Ana', baseRole: MeetRoomMemberRole.SPEAKER });
			const first = await knock(roomData, 'Ana', guestSecretOf(member));
			await knock(roomData, 'Bob');

			const second = await knock(roomData, 'Ana', guestSecretOf(member));

			expect(second.waitingRoomTicket).not.toBe(first.waitingRoomTicket);
			expect(await waiting(roomId)).toEqual(['Bob', 'Ana']);
			expectWaitEnded(
				await askToJoin(roomId, guestSecretOf(member), 'Ana', first.waitingRoomTicket),
				MeetWaitingRoomStatus.LEFT
			);
		});

		it('refuses a name over 1024 characters and lists nobody as waiting', async () => {
			const roomData = await setupWaitingRoomRoom();

			const response = await askToJoin(roomData.room.roomId, roomData.speakerSecret, 'x'.repeat(1025));

			expect(response.status).toBe(422);
			expect(await waiting(roomData.room.roomId)).toEqual([]);
		});

		it('refuses a knock when the waiting room is full', async () => {
			const roomData = await setupWaitingRoomRoom();
			const maxEntries = INTERNAL_CONFIG.WAITING_ROOM_MAX_ENTRIES;
			INTERNAL_CONFIG.WAITING_ROOM_MAX_ENTRIES = 2;

			try {
				await knock(roomData, 'Ana');
				await knock(roomData, 'Bob');
				const response = await askToJoin(roomData.room.roomId, roomData.speakerSecret, 'Carla');

				expect(response.status).toBe(409);
				expect(response.body).toEqual({
					error: 'waiting_room_full',
					message: `The waiting room of room '${roomData.room.roomId}' is full`
				});
			} finally {
				INTERNAL_CONFIG.WAITING_ROOM_MAX_ENTRIES = maxEntries;
			}
		});

		it('lists a knock never followed by a connection at once and removes it as expired within 20 seconds', async () => {
			const roomData = await setupWaitingRoomRoom();
			const { waitingRoomTicket } = await knock(roomData, 'Ana');
			expect(await waiting(roomData.room.roomId)).toEqual(['Ana']);

			const deadline = Date.now() + 25_000;

			while ((await waiting(roomData.room.roomId)).length > 0 && Date.now() < deadline) {
				await new Promise((resolve) => setTimeout(resolve, 1_000));
			}

			expect(await waiting(roomData.room.roomId)).toEqual([]);
			expectWaitEnded(
				await askToJoin(roomData.room.roomId, roomData.speakerSecret, 'Ana', waitingRoomTicket),
				MeetWaitingRoomStatus.EXPIRED
			);
		}, 40_000);
	});

	describe('Joining with the ticket', () => {
		it('answers the same ticket while the wait goes on', async () => {
			const roomData = await setupWaitingRoomRoom();
			const { waitingRoomTicket, participant } = await knock(roomData, 'Ana');

			const response = await askToJoin(roomData.room.roomId, roomData.speakerSecret, 'Ana', waitingRoomTicket);

			expect(response.status).toBe(202);
			expect(response.body).toEqual({ waitingRoomTicket, participant });
		});

		it('joins an admitted participant with the identity of the wait, starts the meeting and refuses the ticket after', async () => {
			const roomData = await setupWaitingRoomRoom();
			const { roomId } = roomData.room;
			const { waitingRoomTicket, participantIdentity } = await knock(roomData, 'Ana');

			const admitted = await admitFromWaitingRoom(roomId, [participantIdentity]);
			expect(admitted.status).toBe(200);
			expect(admitted.body.participants).toEqual([expect.objectContaining({ participantIdentity })]);

			const joined = await askToJoin(roomId, roomData.speakerSecret, 'Ana', waitingRoomTicket);
			expect(joined.status).toBe(200);
			expect(identityOf(joined.body.token)).toBe(participantIdentity);
			await waitForMeetingToStart(roomId);

			// The answer lost after the admission was used: asking again with the ticket finds it used
			expectWaitEnded(
				await askToJoin(roomId, roomData.speakerSecret, 'Ana', waitingRoomTicket),
				MeetWaitingRoomStatus.ADMITTED
			);

			const { token: hostToken } = await startMeetingAsModerator(roomData);
			const { metadata } = jwtDecode<ClaimGrants>(joined.body.token);
			await joinFakeParticipant(roomId, participantIdentity, metadata);
			expect((await kickParticipant(roomId, participantIdentity, hostToken)).status).toBe(200);
			expectWaitEnded(
				await askToJoin(roomId, roomData.speakerSecret, 'Ana', waitingRoomTicket),
				MeetWaitingRoomStatus.ADMITTED
			);
		});

		it('puts an admitted participant who finds the meeting full back in their place', async () => {
			const roomData = await setupWaitingRoomRoom(1);
			const { roomId } = roomData.room;
			const ana = await knock(roomData, 'Ana');
			await knock(roomData, 'Bob');
			expect((await admitFromWaitingRoom(roomId, [ana.participantIdentity])).status).toBe(200);
			await startMeetingAsModerator(roomData);

			const response = await askToJoin(roomId, roomData.speakerSecret, 'Ana', ana.waitingRoomTicket);

			expect(response.status).toBe(202);
			expect(response.body).toEqual({ waitingRoomTicket: ana.waitingRoomTicket, participant: ana.participant });
			expect(await waiting(roomId)).toEqual(['Ana', 'Bob']);
		});

		it('answers 409 with the outcome to the ticket of a wait that ended, and without one to an unknown ticket', async () => {
			const roomData = await setupWaitingRoomRoom();
			const otherRoom = await setupWaitingRoomRoom();
			const { roomId } = roomData.room;
			const rejected = await knock(roomData, 'Ana');
			const left = await knock(roomData, 'Bob');
			const elsewhere = await knock(otherRoom, 'Carla');

			expect((await rejectFromWaitingRoom(roomId, [rejected.participantIdentity])).status).toBe(200);
			expect((await leaveWaitingRoom(roomId, left.waitingRoomTicket)).status).toBe(204);

			const ask = (waitingRoomTicket: string) =>
				askToJoin(roomId, roomData.speakerSecret, 'Ana', waitingRoomTicket);
			expectWaitEnded(await ask(rejected.waitingRoomTicket), MeetWaitingRoomStatus.REJECTED);
			expectWaitEnded(await ask(left.waitingRoomTicket), MeetWaitingRoomStatus.LEFT);
			expectWaitEnded(await ask('unknown-ticket'));
			expectWaitEnded(await ask(elsewhere.waitingRoomTicket));
		});
	});

	describe('Admitting and rejecting', () => {
		it('lists the participants waiting in arrival order, and nobody with the waiting room off', async () => {
			const roomData = await setupWaitingRoomRoom();
			await knock(roomData, 'Ana');
			await knock(roomData, 'Bob');

			expect(await waiting(roomData.room.roomId)).toEqual(['Ana', 'Bob']);

			const roomWithout = await setupSingleRoom(false, 'NO_WAITING_ROOM');
			expect((await getWaitingRoom(roomWithout.room.roomId)).body).toEqual({
				participants: [],
				availablePlaces: null
			});
		});

		it('answers with no meeting running, admitting up to the free places when nobody is named', async () => {
			const roomData = await setupWaitingRoomRoom(2);
			const { roomId } = roomData.room;
			await knock(roomData, 'Ana');
			await knock(roomData, 'Bob');
			await knock(roomData, 'Carla');

			const response = await admitFromWaitingRoom(roomId);

			expect(response.status).toBe(200);
			expect(
				response.body.participants.map(({ participantName }: MeetWaitingRoomParticipant) => participantName)
			).toEqual(['Ana', 'Bob']);
			expect((await getWaitingRoom(roomId)).body).toMatchObject({ availablePlaces: 0 });
			expect(await waiting(roomId)).toEqual(['Carla']);
		});

		it('admits named participants all or none', async () => {
			const roomData = await setupWaitingRoomRoom(1);
			const { roomId } = roomData.room;
			const ana = await knock(roomData, 'Ana');
			const bob = await knock(roomData, 'Bob');

			const notWaiting = await admitFromWaitingRoom(roomId, [ana.participantIdentity, 'ghost-1']);
			expect(notWaiting.status).toBe(404);
			expect(notWaiting.body).toMatchObject({ error: 'participant_not_waiting', participantIdentity: 'ghost-1' });

			const tooMany = await admitFromWaitingRoom(roomId, [ana.participantIdentity, bob.participantIdentity]);
			expect(tooMany.status).toBe(409);
			expect(tooMany.body.error).toBe('not_enough_places');
			expect(await waiting(roomId)).toEqual(['Ana', 'Bob']);
		});

		it('admits one of two concurrent admissions for the last place', async () => {
			const roomData = await setupWaitingRoomRoom(1);
			const { roomId } = roomData.room;
			const ana = await knock(roomData, 'Ana');
			const bob = await knock(roomData, 'Bob');

			const statuses = await Promise.all([
				admitFromWaitingRoom(roomId, [ana.participantIdentity]),
				admitFromWaitingRoom(roomId, [bob.participantIdentity])
			]).then((responses) => responses.map(({ status }) => status).sort());

			expect(statuses).toEqual([200, 409]);
		});

		it('rejects everyone waiting when nobody is named', async () => {
			const roomData = await setupWaitingRoomRoom();
			const { roomId } = roomData.room;
			await knock(roomData, 'Ana');
			await knock(roomData, 'Bob');

			const response = await rejectFromWaitingRoom(roomId);

			expect(response.status).toBe(200);
			expect(response.body.participants).toHaveLength(2);
			expect(await waiting(roomId)).toEqual([]);
		});

		it('refuses an empty list and a repeated identity', async () => {
			const roomData = await setupWaitingRoomRoom();
			const { participantIdentity } = await knock(roomData, 'Ana');

			expect((await admitFromWaitingRoom(roomData.room.roomId, [])).status).toBe(422);
			expect(
				(await rejectFromWaitingRoom(roomData.room.roomId, [participantIdentity, participantIdentity])).status
			).toBe(422);
		});

		it('decides on nobody with the waiting room off', async () => {
			const roomData = await setupSingleRoom(false, 'NO_WAITING_ROOM');
			const { roomId } = roomData.room;

			expect((await admitFromWaitingRoom(roomId, ['ana-1'])).status).toBe(404);
			expect((await admitFromWaitingRoom(roomId)).body).toEqual({ participants: [] });
			expect((await rejectFromWaitingRoom(roomId)).body).toEqual({ participants: [] });
		});

		it('answers 204 to a leave with the ticket of another room, which changes nothing', async () => {
			const roomData = await setupWaitingRoomRoom();
			const otherRoom = await setupWaitingRoomRoom();
			const { waitingRoomTicket } = await knock(roomData, 'Ana');

			expect((await leaveWaitingRoom(otherRoom.room.roomId, waitingRoomTicket)).status).toBe(204);
			expect(await waiting(roomData.room.roomId)).toEqual(['Ana']);
		});
	});

	describe('Ending waits', () => {
		it('ends the waits when the meeting is ended, but not a wait started after', async () => {
			const roomData = await setupWaitingRoomRoom();
			const { roomId } = roomData.room;
			const { token } = await startMeetingAsModerator(roomData);
			const before = await knock(roomData, 'Ana');

			expect((await endMeeting(roomId, token)).status).toBe(200);
			const after = await knock(roomData, 'Bob');

			expectWaitEnded(
				await askToJoin(roomId, roomData.speakerSecret, 'Ana', before.waitingRoomTicket),
				MeetWaitingRoomStatus.MEETING_ENDED
			);
			expect((await askToJoin(roomId, roomData.speakerSecret, 'Bob', after.waitingRoomTicket)).status).toBe(202);
		});

		it('keeps the waits of a meeting that empties', async () => {
			const roomData = await setupWaitingRoomRoom();
			const { roomId } = roomData.room;
			await startMeetingAsModerator(roomData);
			const { waitingRoomTicket } = await knock(roomData, 'Ana');

			await disconnectFakeParticipants();
			await waitForMeetingToEnd(roomId);

			expect((await askToJoin(roomId, roomData.speakerSecret, 'Ana', waitingRoomTicket)).status).toBe(202);
		});

		it('ends the waits of a room closed at once, and of one closed during a meeting only when it ends', async () => {
			const idle = await setupWaitingRoomRoom();
			const idleWait = await knock(idle, 'Ana');

			expect((await updateRoomStatus(idle.room.roomId, MeetRoomStatus.CLOSED)).status).toBe(200);
			expectWaitEnded(
				await askToJoin(idle.room.roomId, idle.speakerSecret, 'Ana', idleWait.waitingRoomTicket),
				MeetWaitingRoomStatus.ROOM_CLOSED
			);

			const live = await setupWaitingRoomRoom();
			const { roomId } = live.room;
			await startMeetingAsModerator(live);
			const liveWait = await knock(live, 'Bob');

			expect((await updateRoomStatus(roomId, MeetRoomStatus.CLOSED)).status).toBe(202);
			expect((await askToJoin(roomId, live.speakerSecret, 'Bob', liveWait.waitingRoomTicket)).status).toBe(202);

			await disconnectFakeParticipants();
			await waitForMeetingToEnd(roomId);
			let response = await askToJoin(roomId, live.speakerSecret, 'Bob', liveWait.waitingRoomTicket);

			for (let attempt = 0; attempt < 20 && response.status === 202; attempt++) {
				await new Promise((resolve) => setTimeout(resolve, 500));
				response = await askToJoin(roomId, live.speakerSecret, 'Bob', liveWait.waitingRoomTicket);
			}

			expect(response.status).toBe(409);
			expect(response.body.status).toBe(MeetWaitingRoomStatus.ROOM_CLOSED);
		});

		it('ends the waits of a deleted room', async () => {
			const roomData = await setupWaitingRoomRoom();
			const { roomId } = roomData.room;
			const { waitingRoomTicket } = await knock(roomData, 'Ana');

			expect((await deleteRoom(roomId)).status).toBe(200);

			const wait = await container.get(WaitingRoomService).findWait(waitingRoomTicket);
			expect(wait).toMatchObject({ status: MeetWaitingRoomStatus.ROOM_CLOSED, ended: true });
		});

		it('lets everyone waiting in when the waiting room is turned off, with the identity they waited with', async () => {
			const roomData = await setupWaitingRoomRoom();
			const { roomId } = roomData.room;
			const { waitingRoomTicket, participantIdentity } = await knock(roomData, 'Ana');

			expect((await updateRoomConfig(roomId, { waitingRoom: { enabled: false } })).status).toBe(200);
			const response = await askToJoin(roomId, roomData.speakerSecret, 'Ana', waitingRoomTicket);

			expect(response.status).toBe(200);
			expect(identityOf(response.body.token)).toBe(participantIdentity);
		});

		it('keeps waiting a participant whose role gains waitingRoomBypass', async () => {
			const roomData = await setupWaitingRoomRoom();
			const { roomId } = roomData.room;
			const { waitingRoomTicket } = await knock(roomData, 'Ana');

			const response = await updateRoomRoles(roomId, { speaker: { permissions: { waitingRoomBypass: true } } });
			expect(response.status).toBe(200);

			expect((await askToJoin(roomId, roomData.speakerSecret, 'Ana', waitingRoomTicket)).status).toBe(202);
		});

		it('invalidates the room member tokens issued before the waiting room is turned on, and only then', async () => {
			const roomData = await setupSingleRoom(false, 'WAITING_ROOM_OFF');
			const { roomId } = roomData.room;
			const { rolesUpdatedAt } = (await getRoom(roomId)).body;
			const joined = await askToJoin(roomId, roomData.speakerSecret, 'Ana');
			expect(joined.status).toBe(200);
			await deleteMeetingRoom(roomId);

			expect((await updateRoomConfig(roomId, { waitingRoom: { enabled: true } })).status).toBe(200);
			const turnedOn = (await getRoom(roomId)).body.rolesUpdatedAt;
			expect(turnedOn).toBeGreaterThan(rolesUpdatedAt);
			expect((await getRoom(roomId, undefined, undefined, roomData.speakerToken)).status).toBe(401);
			expect((await getRoom(roomId, undefined, undefined, `Bearer ${joined.body.token}`)).status).toBe(401);
			const { sub, metadata } = jwtDecode<ClaimGrants>(joined.body.token);
			await joinFakeParticipantUntilRemoved(roomId, sub!, metadata!);

			expect((await updateRoomConfig(roomId, { waitingRoom: { enabled: true, message: 'Soon' } })).status).toBe(
				409
			);
			await deleteMeetingRoom(roomId);
			const tokenAfter = (await askToJoin(roomId, roomData.moderatorSecret, 'Host')).body.token as string;
			await deleteMeetingRoom(roomId);

			expect((await updateRoomConfig(roomId, { waitingRoom: { enabled: true, message: 'Soon' } })).status).toBe(
				200
			);
			expect((await getRoom(roomId)).body.rolesUpdatedAt).toBe(turnedOn);
			expect((await getRoom(roomId, undefined, undefined, `Bearer ${tokenAfter}`)).status).toBe(200);
		});
	});

	describe('Realtime connection of the waiter', () => {
		class WaitingRoomReplica extends WebSocketService {
			readonly app = express();
			readonly httpServer = http.createServer(this.app);

			constructor(readonly redis: RedisService) {
				const logger = new LoggerService();
				super(logger, redis, new RequestSessionService(logger));
				new WaitingRoomRealtimeHandler(
					this,
					container.get(WaitingRoomService),
					container.get(WaitingRoomStateService),
					container.get(RoomRepository),
					logger
				);
			}

			async start(): Promise<void> {
				await new Promise<void>((resolve) => this.httpServer.listen(0, '127.0.0.1', resolve));
				await this.attach(this.httpServer, webSocketHandshakeGuard(this.app));
			}

			url(waitingRoomTicket: string): string {
				const { port } = this.httpServer.address() as AddressInfo;
				return `ws://127.0.0.1:${port}${this.path}?waitingRoomTicket=${encodeURIComponent(waitingRoomTicket)}`;
			}

			ping(): void {
				this.checkLiveness();
			}

			async stop(): Promise<void> {
				this.close();
				await new Promise((resolve) => this.httpServer.close(resolve));
				this.redis.cleanup();
			}
		}

		interface Waiter {
			socket: WebSocket;
			next(): Promise<MeetWaitingRoomState>;
			closed: Promise<number>;
		}

		const sockets: WebSocket[] = [];

		const connect = (url: string): Waiter => {
			const socket = new WebSocket(url);
			sockets.push(socket);
			const queue: MeetWaitingRoomState[] = [];
			const wakers: (() => void)[] = [];
			socket.on('message', (frame) => {
				const message = JSON.parse(String(frame)) as MeetWebSocketMessage<MeetWaitingRoomState>;

				if (message.type !== MEET_WAITING_ROOM_STATE_MESSAGE) return;

				queue.push(message.data!);
				wakers.splice(0).forEach((wake) => wake());
			});
			socket.on('error', () => {});
			const next = async (): Promise<MeetWaitingRoomState> => {
				while (queue.length === 0) await new Promise<void>((wake) => wakers.push(wake));

				return queue.shift()!;
			};
			return { socket, next, closed: new Promise((resolve) => socket.on('close', resolve)) };
		};

		/** The next state with the given status, skipping the earlier ones. */
		const nextWith = async (waiter: Waiter, status: MeetWaitingRoomStatus): Promise<MeetWaitingRoomState> => {
			for (;;) {
				const state = await waiter.next();

				if (state.status === status) return state;
			}
		};

		let replicaA: WaitingRoomReplica;
		let replicaB: WaitingRoomReplica;

		beforeAll(async () => {
			replicaA = new WaitingRoomReplica(new RedisService(new LoggerService()));
			replicaB = new WaitingRoomReplica(new RedisService(new LoggerService()));
			await Promise.all([replicaA.start(), replicaB.start()]);
		});

		afterEach(() => {
			sockets.splice(0).forEach((socket) => socket.terminate());
		});

		afterAll(async () => {
			await Promise.all([replicaA.stop(), replicaB.stop()]);
		});

		it('sends the state on open, holding nothing that identifies the others', async () => {
			const roomData = await setupWaitingRoomRoom();
			await knock(roomData, 'Ana');
			const { waitingRoomTicket } = await knock(roomData, 'Bob');
			await updateRoomConfig(roomData.room.roomId, { waitingRoom: { enabled: true, message: 'Wait here' } });

			const state = await connect(replicaA.url(waitingRoomTicket)).next();

			expect(state).toEqual({
				status: MeetWaitingRoomStatus.WAITING,
				queuePosition: 2,
				waitedSeconds: expect.any(Number),
				meetingActive: false,
				message: 'Wait here'
			});
		});

		it('refuses an unknown ticket', async () => {
			const waiter = connect(replicaA.url('unknown-ticket'));

			expect(await waiter.closed).toBe(MeetWebSocketCloseCode.FORBIDDEN);
		});

		it('tells the waiter, on another replica, that they were admitted or rejected', async () => {
			const roomData = await setupWaitingRoomRoom();
			const ana = await knock(roomData, 'Ana');
			const bob = await knock(roomData, 'Bob');
			const anaWaiter = connect(replicaA.url(ana.waitingRoomTicket));
			const bobWaiter = connect(replicaB.url(bob.waitingRoomTicket));
			await nextWith(anaWaiter, MeetWaitingRoomStatus.WAITING);
			await nextWith(bobWaiter, MeetWaitingRoomStatus.WAITING);

			await admitFromWaitingRoom(roomData.room.roomId, [ana.participantIdentity]);
			await rejectFromWaitingRoom(roomData.room.roomId, [bob.participantIdentity]);

			expect(await nextWith(anaWaiter, MeetWaitingRoomStatus.ADMITTED)).toMatchObject({
				status: MeetWaitingRoomStatus.ADMITTED
			});
			expect(await nextWith(bobWaiter, MeetWaitingRoomStatus.REJECTED)).toMatchObject({
				status: MeetWaitingRoomStatus.REJECTED
			});
		});

		it('keeps the place of a waiter who reconnects through another replica, and tells one who leaves', async () => {
			const roomData = await setupWaitingRoomRoom();
			await knock(roomData, 'Ana');
			const { waitingRoomTicket } = await knock(roomData, 'Bob');
			const first = connect(replicaA.url(waitingRoomTicket));
			await nextWith(first, MeetWaitingRoomStatus.WAITING);
			first.socket.terminate();

			const again = connect(replicaB.url(waitingRoomTicket));
			expect(await again.next()).toMatchObject({ status: MeetWaitingRoomStatus.WAITING, queuePosition: 2 });

			await leaveWaitingRoom(roomData.room.roomId, waitingRoomTicket);
			expect(await nextWith(again, MeetWaitingRoomStatus.LEFT)).toMatchObject({
				status: MeetWaitingRoomStatus.LEFT
			});
			expect(await waiting(roomData.room.roomId)).toEqual(['Ana']);
		});

		it('reports a rejection made while the waiter was disconnected, starting no new wait', async () => {
			const roomData = await setupWaitingRoomRoom();
			const { waitingRoomTicket, participantIdentity } = await knock(roomData, 'Ana');
			await rejectFromWaitingRoom(roomData.room.roomId, [participantIdentity]);

			expect(await connect(replicaA.url(waitingRoomTicket)).next()).toMatchObject({
				status: MeetWaitingRoomStatus.REJECTED
			});
			expect(await waiting(roomData.room.roomId)).toEqual([]);
		});

		it('sends a final state whose push was lost at the next answered ping', async () => {
			const roomData = await setupWaitingRoomRoom();
			const { waitingRoomTicket } = await knock(roomData, 'Ana');
			const waiter = connect(replicaA.url(waitingRoomTicket));
			await nextWith(waiter, MeetWaitingRoomStatus.WAITING);

			await container.get(WaitingRoomStateService).end(roomData.room.roomId, MeetWaitingRoomStatus.REJECTED);
			replicaA.ping();

			expect(await nextWith(waiter, MeetWaitingRoomStatus.REJECTED)).toMatchObject({
				status: MeetWaitingRoomStatus.REJECTED
			});
		});

		it('ends at the next answered ping the waits of a room closed or switched off whose waits were not ended', async () => {
			const closedRoom = await setupWaitingRoomRoom();
			const switchedOff = await setupWaitingRoomRoom();
			const closedWaiter = connect(replicaA.url((await knock(closedRoom, 'Ana')).waitingRoomTicket));
			const letInWaiter = connect(replicaA.url((await knock(switchedOff, 'Bob')).waitingRoomTicket));
			await nextWith(closedWaiter, MeetWaitingRoomStatus.WAITING);
			await nextWith(letInWaiter, MeetWaitingRoomStatus.WAITING);

			const roomRepository = container.get(RoomRepository);
			const { config } = (await roomRepository.findByRoomId(switchedOff.room.roomId))!;
			await roomRepository.updatePartial(closedRoom.room.roomId, { status: MeetRoomStatus.CLOSED });
			await roomRepository.updatePartial(switchedOff.room.roomId, {
				config: { ...config, waitingRoom: { enabled: false } }
			});
			replicaA.ping();

			expect(await nextWith(closedWaiter, MeetWaitingRoomStatus.ROOM_CLOSED)).toMatchObject({
				status: MeetWaitingRoomStatus.ROOM_CLOSED
			});
			expect(await nextWith(letInWaiter, MeetWaitingRoomStatus.ADMITTED)).toMatchObject({
				status: MeetWaitingRoomStatus.ADMITTED
			});
		});

		it('tells the earlier wait of an identity that asks again that it left', async () => {
			const roomData = await setupWaitingRoomRoom();
			const { member } = await setupRoomMember(roomData.room.roomId, {
				name: 'Ana',
				baseRole: MeetRoomMemberRole.SPEAKER
			});
			const first = await knock(roomData, 'Ana', guestSecretOf(member));
			const waiter = connect(replicaA.url(first.waitingRoomTicket));
			await nextWith(waiter, MeetWaitingRoomStatus.WAITING);

			await knock(roomData, 'Ana', guestSecretOf(member));

			expect(await nextWith(waiter, MeetWaitingRoomStatus.LEFT)).toMatchObject({
				status: MeetWaitingRoomStatus.LEFT
			});
		});

		it('removes as expired, within about a minute, a page closed and an admission never used', async () => {
			const roomData = await setupWaitingRoomRoom();
			const { roomId } = roomData.room;
			const ana = await knock(roomData, 'Ana');
			const bob = await knock(roomData, 'Bob');
			const closedPage = connect(replicaA.url(ana.waitingRoomTicket));
			await nextWith(closedPage, MeetWaitingRoomStatus.WAITING);
			const admittedPage = connect(replicaB.url(bob.waitingRoomTicket));
			await nextWith(admittedPage, MeetWaitingRoomStatus.WAITING);
			closedPage.socket.close();
			await admitFromWaitingRoom(roomId, [bob.participantIdentity]);
			await nextWith(admittedPage, MeetWaitingRoomStatus.ADMITTED);

			expect(await nextWith(admittedPage, MeetWaitingRoomStatus.EXPIRED)).toMatchObject({
				status: MeetWaitingRoomStatus.EXPIRED
			});
			const waitingRoomService = container.get(WaitingRoomService);
			await expect(waitingRoomService.findWait(ana.waitingRoomTicket)).resolves.toMatchObject({
				status: MeetWaitingRoomStatus.EXPIRED,
				ended: true
			});
			expect((await getWaitingRoom(roomId)).body).toEqual({ participants: [], availablePlaces: null });
		}, 100_000);
	});
});
