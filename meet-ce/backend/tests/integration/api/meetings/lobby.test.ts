import { afterAll, afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import type { MeetLobbyParticipant, MeetLobbyState, MeetWebSocketMessage } from '@openvidu-meet/typings';
import {
	MEET_LOBBY_STATE_MESSAGE,
	MeetLobbyParticipantType,
	MeetLobbyStatus,
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
import { LobbyRealtimeHandler } from '../../../../src/services/lobby/lobby-realtime.handler.js';
import { LobbyStateService } from '../../../../src/services/lobby/lobby-state.service.js';
import { LobbyService } from '../../../../src/services/lobby/lobby.service.js';
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
	admitFromLobby,
	askToJoin,
	deleteAllRooms,
	deleteRoom,
	endMeeting,
	getLobby,
	getRoom,
	kickParticipant,
	leaveLobby,
	rejectFromLobby,
	startTestServer,
	updateRoomConfig,
	updateRoomRoles,
	updateRoomStatus
} from '../../../helpers/request-helpers.js';
import { guestSecretOf, setupRoomMember, setupSingleRoom } from '../../../helpers/test-scenarios.js';
import { waitForMeetingToEnd, waitForMeetingToStart } from '../../../helpers/wait-helpers.js';
import type { RoomData } from '../../../interfaces/scenarios.js';

const setupLobbyRoom = (maxParticipants: number | null = null, withParticipant = false) =>
	setupSingleRoom(withParticipant, 'LOBBY_ROOM', { lobby: { enabled: true }, maxParticipants });

/** Asks to join with the room's speaker link, which has no lobbyBypass, and answers the ticket. */
const knock = async (roomData: RoomData, name: string, secret = roomData.speakerSecret) => {
	const response = await askToJoin(roomData.room.roomId, secret, name);
	expect(response.status).toBe(202);
	return response.body as { lobbyTicket: string; participantIdentity: string };
};

const identityOf = (token: string) => jwtDecode<ClaimGrants>(token).sub;

const waiting = async (roomId: string) => {
	const response = await getLobby(roomId);
	expect(response.status).toBe(200);
	return (response.body.participants as MeetLobbyParticipant[]).map(({ participantName }) => participantName);
};

/** Starts the meeting of a room through a holder of lobbyBypass, who joins it, and answers their join token. */
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

const expectWaitEnded = (response: { status: number; body: { status?: string } }, status?: MeetLobbyStatus) => {
	expect(response.status).toBe(409);
	expect(response.body).toMatchObject({ error: 'Lobby Error', message: 'The wait has ended' });
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
		it('answers a ticket and the identity listed to whoever lacks lobbyBypass, without starting the meeting', async () => {
			const roomData = await setupLobbyRoom();
			const { roomId } = roomData.room;

			const { lobbyTicket, participantIdentity } = await knock(roomData, 'Ana');

			expect(lobbyTicket).toEqual(expect.any(String));
			expect(participantIdentity).toMatch(/^ana-/);
			const lobby = await getLobby(roomId);
			expect(lobby.body).toEqual({
				participants: [
					{
						participantIdentity,
						participantName: 'Ana',
						type: MeetLobbyParticipantType.ANONYMOUS,
						knockDate: expect.any(Number)
					}
				],
				availablePlaces: null
			});
			expect((await getRoom(roomId)).body.status).toBe(MeetRoomStatus.OPEN);
			expect(await container.get(LiveKitService).roomExists(roomId)).toBe(false);
		});

		it('gives a holder of lobbyBypass a join token at once', async () => {
			const roomData = await setupLobbyRoom();

			const response = await askToJoin(roomData.room.roomId, roomData.moderatorSecret, 'Host');

			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty('token');
		});

		it('refuses the ticket as a room member token', async () => {
			const roomData = await setupLobbyRoom();
			const { lobbyTicket } = await knock(roomData, 'Ana');

			expect((await getLobby(roomData.room.roomId, lobbyTicket)).status).toBe(401);
			expect((await getRoom(roomData.room.roomId, undefined, undefined, lobbyTicket)).status).toBe(401);
		});

		it('lets a participant wait in a full meeting', async () => {
			const roomData = await setupLobbyRoom(1, true);

			await knock(roomData, 'Ana');

			expect(await waiting(roomData.room.roomId)).toEqual(['Ana']);
		});

		it('binds the ticket of a personal link to its member, and lists them as an identified guest', async () => {
			const roomData = await setupLobbyRoom();
			const { roomId } = roomData.room;
			const [ana, bob] = await Promise.all(
				['Ana', 'Bob'].map((name) => setupRoomMember(roomId, { name, baseRole: MeetRoomMemberRole.SPEAKER }))
			);

			const { lobbyTicket, participantIdentity } = await knock(roomData, 'Ana', guestSecretOf(ana!.member));

			expect(participantIdentity).toBe(ana!.member.memberId);
			expect((await getLobby(roomId)).body.participants[0].type).toBe(MeetLobbyParticipantType.IDENTIFIED_GUEST);
			const withBobsLink = await askToJoin(roomId, guestSecretOf(bob!.member), 'Bob', lobbyTicket);
			expect(withBobsLink.status).toBe(403);
		});

		it('ends the earlier wait of the same identity as left, and puts the new one at the end of the line', async () => {
			const roomData = await setupLobbyRoom();
			const { roomId } = roomData.room;
			const { member } = await setupRoomMember(roomId, { name: 'Ana', baseRole: MeetRoomMemberRole.SPEAKER });
			const first = await knock(roomData, 'Ana', guestSecretOf(member));
			await knock(roomData, 'Bob');

			const second = await knock(roomData, 'Ana', guestSecretOf(member));

			expect(second.lobbyTicket).not.toBe(first.lobbyTicket);
			expect(await waiting(roomId)).toEqual(['Bob', 'Ana']);
			expectWaitEnded(
				await askToJoin(roomId, guestSecretOf(member), 'Ana', first.lobbyTicket),
				MeetLobbyStatus.LEFT
			);
		});

		it('refuses a knock when the waiting room is full', async () => {
			const roomData = await setupLobbyRoom();
			const maxEntries = INTERNAL_CONFIG.LOBBY_MAX_ENTRIES;
			INTERNAL_CONFIG.LOBBY_MAX_ENTRIES = 2;

			try {
				await knock(roomData, 'Ana');
				await knock(roomData, 'Bob');
				const response = await askToJoin(roomData.room.roomId, roomData.speakerSecret, 'Carla');

				expect(response.status).toBe(409);
				expect(response.body.message).toBe(`The waiting room of room '${roomData.room.roomId}' is full`);
			} finally {
				INTERNAL_CONFIG.LOBBY_MAX_ENTRIES = maxEntries;
			}
		});

		it('lists a knock never followed by a connection at once and removes it as expired within 20 seconds', async () => {
			const roomData = await setupLobbyRoom();
			const { lobbyTicket } = await knock(roomData, 'Ana');
			expect(await waiting(roomData.room.roomId)).toEqual(['Ana']);

			const deadline = Date.now() + 25_000;

			while ((await waiting(roomData.room.roomId)).length > 0 && Date.now() < deadline) {
				await new Promise((resolve) => setTimeout(resolve, 1_000));
			}

			expect(await waiting(roomData.room.roomId)).toEqual([]);
			expectWaitEnded(
				await askToJoin(roomData.room.roomId, roomData.speakerSecret, 'Ana', lobbyTicket),
				MeetLobbyStatus.EXPIRED
			);
		}, 40_000);
	});

	describe('Joining with the ticket', () => {
		it('answers the same ticket while the wait goes on', async () => {
			const roomData = await setupLobbyRoom();
			const { lobbyTicket, participantIdentity } = await knock(roomData, 'Ana');

			const response = await askToJoin(roomData.room.roomId, roomData.speakerSecret, 'Ana', lobbyTicket);

			expect(response.status).toBe(202);
			expect(response.body).toEqual({ lobbyTicket, participantIdentity });
		});

		it('joins an admitted participant with the identity of the wait, starts the meeting and refuses the ticket after', async () => {
			const roomData = await setupLobbyRoom();
			const { roomId } = roomData.room;
			const { lobbyTicket, participantIdentity } = await knock(roomData, 'Ana');

			const admitted = await admitFromLobby(roomId, [participantIdentity]);
			expect(admitted.status).toBe(200);
			expect(admitted.body.participants).toEqual([expect.objectContaining({ participantIdentity })]);

			const joined = await askToJoin(roomId, roomData.speakerSecret, 'Ana', lobbyTicket);
			expect(joined.status).toBe(200);
			expect(identityOf(joined.body.token)).toBe(participantIdentity);
			await waitForMeetingToStart(roomId);

			// The answer lost after the admission was used: asking again with the ticket finds it used
			expectWaitEnded(
				await askToJoin(roomId, roomData.speakerSecret, 'Ana', lobbyTicket),
				MeetLobbyStatus.ADMITTED
			);

			const { token: hostToken } = await startMeetingAsModerator(roomData);
			const { metadata } = jwtDecode<ClaimGrants>(joined.body.token);
			await joinFakeParticipant(roomId, participantIdentity, metadata);
			expect((await kickParticipant(roomId, participantIdentity, hostToken)).status).toBe(200);
			expectWaitEnded(
				await askToJoin(roomId, roomData.speakerSecret, 'Ana', lobbyTicket),
				MeetLobbyStatus.ADMITTED
			);
		});

		it('puts an admitted participant who finds the meeting full back in their place', async () => {
			const roomData = await setupLobbyRoom(1);
			const { roomId } = roomData.room;
			const ana = await knock(roomData, 'Ana');
			await knock(roomData, 'Bob');
			expect((await admitFromLobby(roomId, [ana.participantIdentity])).status).toBe(200);
			await startMeetingAsModerator(roomData);

			const response = await askToJoin(roomId, roomData.speakerSecret, 'Ana', ana.lobbyTicket);

			expect(response.status).toBe(202);
			expect(response.body).toEqual(ana);
			expect(await waiting(roomId)).toEqual(['Ana', 'Bob']);
		});

		it('answers 409 with the outcome to the ticket of a wait that ended, and without one to an unknown ticket', async () => {
			const roomData = await setupLobbyRoom();
			const otherRoom = await setupLobbyRoom();
			const { roomId } = roomData.room;
			const rejected = await knock(roomData, 'Ana');
			const left = await knock(roomData, 'Bob');
			const elsewhere = await knock(otherRoom, 'Carla');

			expect((await rejectFromLobby(roomId, [rejected.participantIdentity])).status).toBe(200);
			expect((await leaveLobby(roomId, left.lobbyTicket)).status).toBe(204);

			const ask = (lobbyTicket: string) => askToJoin(roomId, roomData.speakerSecret, 'Ana', lobbyTicket);
			expectWaitEnded(await ask(rejected.lobbyTicket), MeetLobbyStatus.REJECTED);
			expectWaitEnded(await ask(left.lobbyTicket), MeetLobbyStatus.LEFT);
			expectWaitEnded(await ask('unknown-ticket'));
			expectWaitEnded(await ask(elsewhere.lobbyTicket));
		});
	});

	describe('Admitting and rejecting', () => {
		it('lists the participants waiting in arrival order, and nobody with the waiting room off', async () => {
			const roomData = await setupLobbyRoom();
			await knock(roomData, 'Ana');
			await knock(roomData, 'Bob');

			expect(await waiting(roomData.room.roomId)).toEqual(['Ana', 'Bob']);

			const roomWithout = await setupSingleRoom(false, 'NO_LOBBY');
			expect((await getLobby(roomWithout.room.roomId)).body).toEqual({ participants: [], availablePlaces: null });
		});

		it('answers with no meeting running, admitting up to the free places when nobody is named', async () => {
			const roomData = await setupLobbyRoom(2);
			const { roomId } = roomData.room;
			await knock(roomData, 'Ana');
			await knock(roomData, 'Bob');
			await knock(roomData, 'Carla');

			const response = await admitFromLobby(roomId);

			expect(response.status).toBe(200);
			expect(
				response.body.participants.map(({ participantName }: MeetLobbyParticipant) => participantName)
			).toEqual(['Ana', 'Bob']);
			expect((await getLobby(roomId)).body).toMatchObject({ availablePlaces: 0 });
			expect(await waiting(roomId)).toEqual(['Carla']);
		});

		it('admits named participants all or none', async () => {
			const roomData = await setupLobbyRoom(1);
			const { roomId } = roomData.room;
			const ana = await knock(roomData, 'Ana');
			const bob = await knock(roomData, 'Bob');

			const notWaiting = await admitFromLobby(roomId, [ana.participantIdentity, 'ghost-1']);
			expect(notWaiting.status).toBe(404);
			expect(notWaiting.body.message).toContain("'ghost-1'");

			const tooMany = await admitFromLobby(roomId, [ana.participantIdentity, bob.participantIdentity]);
			expect(tooMany.status).toBe(409);
			expect(await waiting(roomId)).toEqual(['Ana', 'Bob']);
		});

		it('admits one of two concurrent admissions for the last place', async () => {
			const roomData = await setupLobbyRoom(1);
			const { roomId } = roomData.room;
			const ana = await knock(roomData, 'Ana');
			const bob = await knock(roomData, 'Bob');

			const statuses = await Promise.all([
				admitFromLobby(roomId, [ana.participantIdentity]),
				admitFromLobby(roomId, [bob.participantIdentity])
			]).then((responses) => responses.map(({ status }) => status).sort());

			expect(statuses).toEqual([200, 409]);
		});

		it('rejects everyone waiting when nobody is named', async () => {
			const roomData = await setupLobbyRoom();
			const { roomId } = roomData.room;
			await knock(roomData, 'Ana');
			await knock(roomData, 'Bob');

			const response = await rejectFromLobby(roomId);

			expect(response.status).toBe(200);
			expect(response.body.participants).toHaveLength(2);
			expect(await waiting(roomId)).toEqual([]);
		});

		it('refuses an empty list and a repeated identity', async () => {
			const roomData = await setupLobbyRoom();
			const { participantIdentity } = await knock(roomData, 'Ana');

			expect((await admitFromLobby(roomData.room.roomId, [])).status).toBe(422);
			expect(
				(await rejectFromLobby(roomData.room.roomId, [participantIdentity, participantIdentity])).status
			).toBe(422);
		});

		it('decides on nobody with the waiting room off', async () => {
			const roomData = await setupSingleRoom(false, 'NO_LOBBY');
			const { roomId } = roomData.room;

			expect((await admitFromLobby(roomId, ['ana-1'])).status).toBe(404);
			expect((await admitFromLobby(roomId)).body).toEqual({ participants: [] });
			expect((await rejectFromLobby(roomId)).body).toEqual({ participants: [] });
		});

		it('answers 204 to a leave with the ticket of another room, which changes nothing', async () => {
			const roomData = await setupLobbyRoom();
			const otherRoom = await setupLobbyRoom();
			const { lobbyTicket } = await knock(roomData, 'Ana');

			expect((await leaveLobby(otherRoom.room.roomId, lobbyTicket)).status).toBe(204);
			expect(await waiting(roomData.room.roomId)).toEqual(['Ana']);
		});
	});

	describe('Ending waits', () => {
		it('ends the waits when the meeting is ended, but not a wait started after', async () => {
			const roomData = await setupLobbyRoom();
			const { roomId } = roomData.room;
			const { token } = await startMeetingAsModerator(roomData);
			const before = await knock(roomData, 'Ana');

			expect((await endMeeting(roomId, token)).status).toBe(200);
			const after = await knock(roomData, 'Bob');

			expectWaitEnded(
				await askToJoin(roomId, roomData.speakerSecret, 'Ana', before.lobbyTicket),
				MeetLobbyStatus.MEETING_ENDED
			);
			expect((await askToJoin(roomId, roomData.speakerSecret, 'Bob', after.lobbyTicket)).status).toBe(202);
		});

		it('keeps the waits of a meeting that empties', async () => {
			const roomData = await setupLobbyRoom();
			const { roomId } = roomData.room;
			await startMeetingAsModerator(roomData);
			const { lobbyTicket } = await knock(roomData, 'Ana');

			await disconnectFakeParticipants();
			await waitForMeetingToEnd(roomId);

			expect((await askToJoin(roomId, roomData.speakerSecret, 'Ana', lobbyTicket)).status).toBe(202);
		});

		it('ends the waits of a room closed at once, and of one closed during a meeting only when it ends', async () => {
			const idle = await setupLobbyRoom();
			const idleWait = await knock(idle, 'Ana');

			expect((await updateRoomStatus(idle.room.roomId, MeetRoomStatus.CLOSED)).status).toBe(200);
			expectWaitEnded(
				await askToJoin(idle.room.roomId, idle.speakerSecret, 'Ana', idleWait.lobbyTicket),
				MeetLobbyStatus.ROOM_CLOSED
			);

			const live = await setupLobbyRoom();
			const { roomId } = live.room;
			await startMeetingAsModerator(live);
			const liveWait = await knock(live, 'Bob');

			expect((await updateRoomStatus(roomId, MeetRoomStatus.CLOSED)).status).toBe(202);
			expect((await askToJoin(roomId, live.speakerSecret, 'Bob', liveWait.lobbyTicket)).status).toBe(202);

			await disconnectFakeParticipants();
			await waitForMeetingToEnd(roomId);
			let response = await askToJoin(roomId, live.speakerSecret, 'Bob', liveWait.lobbyTicket);

			for (let attempt = 0; attempt < 20 && response.status === 202; attempt++) {
				await new Promise((resolve) => setTimeout(resolve, 500));
				response = await askToJoin(roomId, live.speakerSecret, 'Bob', liveWait.lobbyTicket);
			}

			expect(response.status).toBe(409);
			expect(response.body.status).toBe(MeetLobbyStatus.ROOM_CLOSED);
		});

		it('ends the waits of a deleted room', async () => {
			const roomData = await setupLobbyRoom();
			const { roomId } = roomData.room;
			const { lobbyTicket } = await knock(roomData, 'Ana');

			expect((await deleteRoom(roomId)).status).toBe(200);

			const wait = await container.get(LobbyService).findWait(lobbyTicket);
			expect(wait).toMatchObject({ status: MeetLobbyStatus.ROOM_CLOSED, ended: true });
		});

		it('lets everyone waiting in when the waiting room is turned off, with the identity they waited with', async () => {
			const roomData = await setupLobbyRoom();
			const { roomId } = roomData.room;
			const { lobbyTicket, participantIdentity } = await knock(roomData, 'Ana');

			expect((await updateRoomConfig(roomId, { lobby: { enabled: false } })).status).toBe(200);
			const response = await askToJoin(roomId, roomData.speakerSecret, 'Ana', lobbyTicket);

			expect(response.status).toBe(200);
			expect(identityOf(response.body.token)).toBe(participantIdentity);
		});

		it('keeps waiting a participant whose role gains lobbyBypass', async () => {
			const roomData = await setupLobbyRoom();
			const { roomId } = roomData.room;
			const { lobbyTicket } = await knock(roomData, 'Ana');

			const response = await updateRoomRoles(roomId, { speaker: { permissions: { lobbyBypass: true } } });
			expect(response.status).toBe(200);

			expect((await askToJoin(roomId, roomData.speakerSecret, 'Ana', lobbyTicket)).status).toBe(202);
		});

		it('invalidates the room member tokens issued before the waiting room is turned on, and only then', async () => {
			const roomData = await setupSingleRoom(false, 'LOBBY_OFF');
			const { roomId } = roomData.room;
			const { rolesUpdatedAt } = (await getRoom(roomId)).body;
			const joined = await askToJoin(roomId, roomData.speakerSecret, 'Ana');
			expect(joined.status).toBe(200);
			await deleteMeetingRoom(roomId);

			expect((await updateRoomConfig(roomId, { lobby: { enabled: true } })).status).toBe(200);
			const turnedOn = (await getRoom(roomId)).body.rolesUpdatedAt;
			expect(turnedOn).toBeGreaterThan(rolesUpdatedAt);
			expect((await getRoom(roomId, undefined, undefined, roomData.speakerToken)).status).toBe(401);
			expect((await getRoom(roomId, undefined, undefined, `Bearer ${joined.body.token}`)).status).toBe(401);
			const { sub, metadata } = jwtDecode<ClaimGrants>(joined.body.token);
			await joinFakeParticipantUntilRemoved(roomId, sub!, metadata!);

			expect((await updateRoomConfig(roomId, { lobby: { enabled: true, message: 'Soon' } })).status).toBe(409);
			await deleteMeetingRoom(roomId);
			const tokenAfter = (await askToJoin(roomId, roomData.moderatorSecret, 'Host')).body.token as string;
			await deleteMeetingRoom(roomId);

			expect((await updateRoomConfig(roomId, { lobby: { enabled: true, message: 'Soon' } })).status).toBe(200);
			expect((await getRoom(roomId)).body.rolesUpdatedAt).toBe(turnedOn);
			expect((await getRoom(roomId, undefined, undefined, `Bearer ${tokenAfter}`)).status).toBe(200);
		});
	});

	describe('Realtime connection of the waiter', () => {
		class LobbyReplica extends WebSocketService {
			readonly app = express();
			readonly httpServer = http.createServer(this.app);

			constructor(readonly redis: RedisService) {
				const logger = new LoggerService();
				super(logger, redis, new RequestSessionService(logger));
				new LobbyRealtimeHandler(
					this,
					container.get(LobbyService),
					container.get(LobbyStateService),
					container.get(RoomRepository),
					logger
				);
			}

			async start(): Promise<void> {
				await new Promise<void>((resolve) => this.httpServer.listen(0, '127.0.0.1', resolve));
				await this.attach(this.httpServer, webSocketHandshakeGuard(this.app));
			}

			url(lobbyTicket: string): string {
				const { port } = this.httpServer.address() as AddressInfo;
				return `ws://127.0.0.1:${port}${this.path}?lobbyTicket=${encodeURIComponent(lobbyTicket)}`;
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
			next(): Promise<MeetLobbyState>;
			closed: Promise<number>;
		}

		const sockets: WebSocket[] = [];

		const connect = (url: string): Waiter => {
			const socket = new WebSocket(url);
			sockets.push(socket);
			const queue: MeetLobbyState[] = [];
			const wakers: (() => void)[] = [];
			socket.on('message', (frame) => {
				const message = JSON.parse(String(frame)) as MeetWebSocketMessage<MeetLobbyState>;

				if (message.type !== MEET_LOBBY_STATE_MESSAGE) return;

				queue.push(message.data!);
				wakers.splice(0).forEach((wake) => wake());
			});
			socket.on('error', () => {});
			const next = async (): Promise<MeetLobbyState> => {
				while (queue.length === 0) await new Promise<void>((wake) => wakers.push(wake));

				return queue.shift()!;
			};
			return { socket, next, closed: new Promise((resolve) => socket.on('close', resolve)) };
		};

		/** The next state with the given status, skipping the earlier ones. */
		const nextWith = async (waiter: Waiter, status: MeetLobbyStatus): Promise<MeetLobbyState> => {
			for (;;) {
				const state = await waiter.next();

				if (state.status === status) return state;
			}
		};

		let replicaA: LobbyReplica;
		let replicaB: LobbyReplica;

		beforeAll(async () => {
			replicaA = new LobbyReplica(new RedisService(new LoggerService()));
			replicaB = new LobbyReplica(new RedisService(new LoggerService()));
			await Promise.all([replicaA.start(), replicaB.start()]);
		});

		afterEach(() => {
			sockets.splice(0).forEach((socket) => socket.terminate());
		});

		afterAll(async () => {
			await Promise.all([replicaA.stop(), replicaB.stop()]);
		});

		it('sends the state on open, holding nothing that identifies the others', async () => {
			const roomData = await setupLobbyRoom();
			await knock(roomData, 'Ana');
			const { lobbyTicket } = await knock(roomData, 'Bob');
			await updateRoomConfig(roomData.room.roomId, { lobby: { enabled: true, message: 'Wait here' } });

			const state = await connect(replicaA.url(lobbyTicket)).next();

			expect(state).toEqual({
				status: MeetLobbyStatus.WAITING,
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
			const roomData = await setupLobbyRoom();
			const ana = await knock(roomData, 'Ana');
			const bob = await knock(roomData, 'Bob');
			const anaWaiter = connect(replicaA.url(ana.lobbyTicket));
			const bobWaiter = connect(replicaB.url(bob.lobbyTicket));
			await nextWith(anaWaiter, MeetLobbyStatus.WAITING);
			await nextWith(bobWaiter, MeetLobbyStatus.WAITING);

			await admitFromLobby(roomData.room.roomId, [ana.participantIdentity]);
			await rejectFromLobby(roomData.room.roomId, [bob.participantIdentity]);

			expect(await nextWith(anaWaiter, MeetLobbyStatus.ADMITTED)).toMatchObject({
				status: MeetLobbyStatus.ADMITTED
			});
			expect(await nextWith(bobWaiter, MeetLobbyStatus.REJECTED)).toMatchObject({
				status: MeetLobbyStatus.REJECTED
			});
		});

		it('keeps the place of a waiter who reconnects through another replica, and tells one who leaves', async () => {
			const roomData = await setupLobbyRoom();
			await knock(roomData, 'Ana');
			const { lobbyTicket } = await knock(roomData, 'Bob');
			const first = connect(replicaA.url(lobbyTicket));
			await nextWith(first, MeetLobbyStatus.WAITING);
			first.socket.terminate();

			const again = connect(replicaB.url(lobbyTicket));
			expect(await again.next()).toMatchObject({ status: MeetLobbyStatus.WAITING, queuePosition: 2 });

			await leaveLobby(roomData.room.roomId, lobbyTicket);
			expect(await nextWith(again, MeetLobbyStatus.LEFT)).toMatchObject({ status: MeetLobbyStatus.LEFT });
			expect(await waiting(roomData.room.roomId)).toEqual(['Ana']);
		});

		it('reports a rejection made while the waiter was disconnected, starting no new wait', async () => {
			const roomData = await setupLobbyRoom();
			const { lobbyTicket, participantIdentity } = await knock(roomData, 'Ana');
			await rejectFromLobby(roomData.room.roomId, [participantIdentity]);

			expect(await connect(replicaA.url(lobbyTicket)).next()).toMatchObject({ status: MeetLobbyStatus.REJECTED });
			expect(await waiting(roomData.room.roomId)).toEqual([]);
		});

		it('sends a final state whose push was lost at the next answered ping', async () => {
			const roomData = await setupLobbyRoom();
			const { lobbyTicket } = await knock(roomData, 'Ana');
			const waiter = connect(replicaA.url(lobbyTicket));
			await nextWith(waiter, MeetLobbyStatus.WAITING);

			await container.get(LobbyStateService).end(roomData.room.roomId, MeetLobbyStatus.REJECTED);
			replicaA.ping();

			expect(await nextWith(waiter, MeetLobbyStatus.REJECTED)).toMatchObject({
				status: MeetLobbyStatus.REJECTED
			});
		});

		it('ends at the next answered ping the waits of a room closed or switched off whose waits were not ended', async () => {
			const closedRoom = await setupLobbyRoom();
			const switchedOff = await setupLobbyRoom();
			const closedWaiter = connect(replicaA.url((await knock(closedRoom, 'Ana')).lobbyTicket));
			const letInWaiter = connect(replicaA.url((await knock(switchedOff, 'Bob')).lobbyTicket));
			await nextWith(closedWaiter, MeetLobbyStatus.WAITING);
			await nextWith(letInWaiter, MeetLobbyStatus.WAITING);

			const roomRepository = container.get(RoomRepository);
			const { config } = (await roomRepository.findByRoomId(switchedOff.room.roomId))!;
			await roomRepository.updatePartial(closedRoom.room.roomId, { status: MeetRoomStatus.CLOSED });
			await roomRepository.updatePartial(switchedOff.room.roomId, {
				config: { ...config, lobby: { enabled: false } }
			});
			replicaA.ping();

			expect(await nextWith(closedWaiter, MeetLobbyStatus.ROOM_CLOSED)).toMatchObject({
				status: MeetLobbyStatus.ROOM_CLOSED
			});
			expect(await nextWith(letInWaiter, MeetLobbyStatus.ADMITTED)).toMatchObject({
				status: MeetLobbyStatus.ADMITTED
			});
		});

		it('tells the earlier wait of an identity that asks again that it left', async () => {
			const roomData = await setupLobbyRoom();
			const { member } = await setupRoomMember(roomData.room.roomId, {
				name: 'Ana',
				baseRole: MeetRoomMemberRole.SPEAKER
			});
			const first = await knock(roomData, 'Ana', guestSecretOf(member));
			const waiter = connect(replicaA.url(first.lobbyTicket));
			await nextWith(waiter, MeetLobbyStatus.WAITING);

			await knock(roomData, 'Ana', guestSecretOf(member));

			expect(await nextWith(waiter, MeetLobbyStatus.LEFT)).toMatchObject({ status: MeetLobbyStatus.LEFT });
		});

		it('removes as expired, within about a minute, a page closed and an admission never used', async () => {
			const roomData = await setupLobbyRoom();
			const { roomId } = roomData.room;
			const ana = await knock(roomData, 'Ana');
			const bob = await knock(roomData, 'Bob');
			const closedPage = connect(replicaA.url(ana.lobbyTicket));
			await nextWith(closedPage, MeetLobbyStatus.WAITING);
			const admittedPage = connect(replicaB.url(bob.lobbyTicket));
			await nextWith(admittedPage, MeetLobbyStatus.WAITING);
			closedPage.socket.close();
			await admitFromLobby(roomId, [bob.participantIdentity]);
			await nextWith(admittedPage, MeetLobbyStatus.ADMITTED);

			expect(await nextWith(admittedPage, MeetLobbyStatus.EXPIRED)).toMatchObject({
				status: MeetLobbyStatus.EXPIRED
			});
			const lobbyService = container.get(LobbyService);
			await expect(lobbyService.findWait(ana.lobbyTicket)).resolves.toMatchObject({
				status: MeetLobbyStatus.EXPIRED,
				ended: true
			});
			expect((await getLobby(roomId)).body).toEqual({ participants: [], availablePlaces: null });
		}, 100_000);
	});
});
