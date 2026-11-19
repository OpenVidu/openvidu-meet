import { afterAll, afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import type {
	MeetWaitingParticipant,
	MeetWaitingParticipantState,
	MeetWaitingTicketResponse,
	MeetWebSocketMessage
} from '@openvidu-meet/typings';
import {
	MEET_WAITING_PARTICIPANT_STATE_MESSAGE,
	MeetParticipantType,
	MeetWaitingParticipantStatus,
	MeetRoomMemberRole,
	MeetRoomStatus,
	participantRoleOf,
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
import { WaitingParticipantRealtimeHandler } from '../../../../src/services/waiting-participants/waiting-participant-realtime.handler.js';
import { WaitingParticipantStateService } from '../../../../src/services/waiting-participants/waiting-participant-state.service.js';
import { WaitingParticipantService } from '../../../../src/services/waiting-participants/waiting-participant.service.js';
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
	admitAllWaitingParticipants,
	admitWaitingParticipant,
	askToJoin,
	bulkRejectWaitingParticipants,
	createRoom,
	deleteAllRooms,
	deleteAllUsers,
	deleteRoom,
	endMeeting,
	generateRoomMemberTokenRequest,
	getMeeting,
	getRoom,
	getWaitingParticipant,
	getWaitingParticipants,
	kickParticipant,
	leaveWaiting,
	rejectWaitingParticipant,
	startTestServer,
	updateRoomAccessConfig,
	updateRoomMember,
	updateRoomRoles,
	updateRoomStatus
} from '../../../helpers/request-helpers.js';
import { guestSecretOf, setupRoomMember, setupSingleRoom, setupTestUsers } from '../../../helpers/test-scenarios.js';
import { errorRoomClosed } from '../../../../src/models/error.model.js';
import { expectMeetError } from '../../../helpers/assertion-helpers.js';
import { waitForMeetingToEnd, waitForMeetingToStart } from '../../../helpers/wait-helpers.js';
import type { RoomData } from '../../../interfaces/scenarios.js';

const setupLockedRoom = (maxParticipants: number | null = null, withParticipant = false) =>
	setupSingleRoom(withParticipant, 'LOCKED_ROOM', { maxParticipants }, { lock: { enabled: true } });

/** Asks to join with the room's speaker link, which has no accessBypassLock, and answers the ticket. */
const knock = async (roomData: RoomData, name: string, secret = roomData.speakerSecret) => {
	const response = await askToJoin(roomData.room.roomId, secret, name);
	expect(response.status).toBe(202);
	const { waitingTicket, participant } = response.body as MeetWaitingTicketResponse;
	return { waitingTicket, participant, participantIdentity: participant.participantIdentity };
};

const identityOf = (token: string) => jwtDecode<ClaimGrants>(token).sub;

const waitingNames = (participants: MeetWaitingParticipant[]) =>
	participants.map(({ participantName }) => participantName).sort();

const waiting = async (roomId: string) => {
	const response = await getWaitingParticipants(roomId);
	expect(response.status).toBe(200);
	return waitingNames(response.body.participants);
};

/** Starts the meeting of a room through a holder of accessBypassLock, who joins it, and answers their join token. */
const startMeetingAsModerator = async (roomData: RoomData) => {
	const response = await askToJoin(roomData.room.roomId, roomData.moderatorSecret, 'Host');
	expect(response.status).toBe(200);
	const token: string = response.body.token;
	const { sub, metadata } = jwtDecode<ClaimGrants>(token);
	await joinFakeParticipant(roomData.room.roomId, sub!, metadata);
	await waitForMeetingToStart(roomData.room.roomId);
	return { token: `Bearer ${token}`, identity: sub! };
};

/** A locked room whose meeting runs with its host and Sam, a speaker admitted into it, and Ana waiting. */
const setupMeetingWithWaiter = async () => {
	const roomData = await setupLockedRoom();
	const { roomId } = roomData.room;
	const { token: hostToken } = await startMeetingAsModerator(roomData);
	const sam = await knock(roomData, 'Sam');
	expect((await admitWaitingParticipant(roomId, sam.participantIdentity)).status).toBe(200);
	const joined = await askToJoin(roomId, roomData.speakerSecret, 'Sam', sam.waitingTicket);
	expect(joined.status).toBe(200);
	const { sub, metadata } = jwtDecode<ClaimGrants>(joined.body.token);
	await joinFakeParticipant(roomId, sub!, metadata);
	await knock(roomData, 'Ana');
	return { roomId, hostToken, speakerToken: `Bearer ${joined.body.token}` };
};

const deleteMeetingRoom = async (roomId: string) => {
	await container.get(LiveKitService).deleteRoom(roomId);
	await waitForMeetingToEnd(roomId);
};

const expectWaitEnded = (
	response: { status: number; body: { status?: string } },
	status?: MeetWaitingParticipantStatus
) => {
	expect(response.status).toBe(409);
	expect(response.body).toMatchObject({ error: 'wait_ended', message: 'The wait has ended' });
	expect(response.body.status).toBe(status);
};

describe('Waiting participants', () => {
	beforeAll(async () => {
		await startTestServer();
	});

	afterAll(async () => {
		await disconnectFakeParticipants();
		await deleteAllRooms();
		await deleteAllUsers();
	});

	describe('Asking to join', () => {
		it('answers a ticket and the identity listed to whoever lacks accessBypassLock, without starting the meeting', async () => {
			const roomData = await setupLockedRoom();
			const { roomId } = roomData.room;

			const { waitingTicket, participantIdentity } = await knock(roomData, 'Ana');

			expect(waitingTicket).toEqual(expect.any(String));
			expect(participantIdentity).toMatch(/^ana-/);
			const locked = await getWaitingParticipants(roomId);
			expect(locked.body).toEqual({
				participants: [
					{
						participantIdentity,
						participantName: 'Ana',
						type: MeetParticipantType.ANONYMOUS,
						role: MeetRoomMemberRole.SPEAKER,
						knockDate: expect.any(Number)
					}
				]
			});
			expect((await getRoom(roomId)).body.status).toBe(MeetRoomStatus.OPEN);
			expect(await container.get(LiveKitService).roomExists(roomId)).toBe(false);
		});

		it('gives a holder of accessBypassLock a join token at once', async () => {
			const roomData = await setupLockedRoom();

			const response = await askToJoin(roomData.room.roomId, roomData.moderatorSecret, 'Host');

			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty('token');
		});

		it('gives an admin and the room owner a join token at once', async () => {
			const { admin, roomManager } = await setupTestUsers();
			const room = await createRoom(
				{ roomName: 'OWNED_LOCKED_ROOM', access: { lock: { enabled: true } } },
				roomManager.accessToken
			);

			for (const accessToken of [admin.accessToken, roomManager.accessToken]) {
				const response = await generateRoomMemberTokenRequest(
					room.roomId,
					{ joinMeeting: true, participantName: 'Host' },
					accessToken
				);

				expect(response.status).toBe(200);
				expect(response.body).toHaveProperty('token');
			}
		});

		it('answers 409 to a speaker asking to join a closed locked room, and lists nobody as waiting', async () => {
			const roomData = await setupLockedRoom();
			expect((await updateRoomStatus(roomData.room.roomId, MeetRoomStatus.CLOSED)).status).toBe(200);

			expectMeetError(
				await askToJoin(roomData.room.roomId, roomData.speakerSecret, 'Ana'),
				errorRoomClosed(roomData.room.roomId)
			);
			expect(await waiting(roomData.room.roomId)).toEqual([]);
		});

		it('refuses the ticket as a room member token', async () => {
			const roomData = await setupLockedRoom();
			const { waitingTicket } = await knock(roomData, 'Ana');

			expect((await getWaitingParticipants(roomData.room.roomId, waitingTicket)).status).toBe(401);
			expect((await getRoom(roomData.room.roomId, undefined, undefined, waitingTicket)).status).toBe(401);
		});

		it('lets a participant wait in a full meeting', async () => {
			const roomData = await setupLockedRoom(1, true);

			await knock(roomData, 'Ana');

			expect(await waiting(roomData.room.roomId)).toEqual(['Ana']);
		});

		it('binds the ticket of a personal link to its member, and lists them as an identified guest', async () => {
			const roomData = await setupLockedRoom();
			const { roomId } = roomData.room;
			const [ana, bob] = await Promise.all(
				['Ana', 'Bob'].map((name) => setupRoomMember(roomId, { name, baseRole: MeetRoomMemberRole.SPEAKER }))
			);

			const { waitingTicket, participantIdentity } = await knock(roomData, 'Ana', guestSecretOf(ana!.member));

			expect(participantIdentity).toBe(ana!.member.memberId);
			expect((await getWaitingParticipants(roomId)).body.participants[0].type).toBe(
				MeetParticipantType.IDENTIFIED_GUEST
			);
			const withBobsLink = await askToJoin(roomId, guestSecretOf(bob!.member), 'Bob', waitingTicket);
			expect(withBobsLink.status).toBe(403);
		});

		it('lists the role of the link the participant asked with', async () => {
			const roomData = await setupLockedRoom();
			const { roomId } = roomData.room;
			const roles = await updateRoomRoles(roomId, { moderator: { permissions: { accessBypassLock: false } } });
			expect(roles.status).toBe(200);

			const { participantIdentity } = await knock(roomData, 'Host', roomData.moderatorSecret);

			const response = await getWaitingParticipant(roomId, participantIdentity);
			expect(response.status).toBe(200);
			expect(response.body.role).toBe(MeetRoomMemberRole.MODERATOR);
		});

		it('ends the earlier wait of the same identity as left, and starts a new one', async () => {
			const roomData = await setupLockedRoom();
			const { roomId } = roomData.room;
			const { member } = await setupRoomMember(roomId, { name: 'Ana', baseRole: MeetRoomMemberRole.SPEAKER });
			const first = await knock(roomData, 'Ana', guestSecretOf(member));
			await knock(roomData, 'Bob');

			const second = await knock(roomData, 'Ana', guestSecretOf(member));

			expect(second.waitingTicket).not.toBe(first.waitingTicket);
			expect(await waiting(roomId)).toEqual(['Ana', 'Bob']);
			expectWaitEnded(
				await askToJoin(roomId, guestSecretOf(member), 'Ana', first.waitingTicket),
				MeetWaitingParticipantStatus.LEFT
			);
		});

		it('refuses a name over 1024 characters and lists nobody as waiting', async () => {
			const roomData = await setupLockedRoom();

			const response = await askToJoin(roomData.room.roomId, roomData.speakerSecret, 'x'.repeat(1025));

			expect(response.status).toBe(422);
			expect(await waiting(roomData.room.roomId)).toEqual([]);
		});

		it('refuses a knock when the waiting list is full', async () => {
			const roomData = await setupLockedRoom();
			const maxEntries = INTERNAL_CONFIG.WAITING_PARTICIPANT_MAX_ENTRIES;
			INTERNAL_CONFIG.WAITING_PARTICIPANT_MAX_ENTRIES = 2;

			try {
				await knock(roomData, 'Ana');
				await knock(roomData, 'Bob');
				const response = await askToJoin(roomData.room.roomId, roomData.speakerSecret, 'Carla');

				expect(response.status).toBe(409);
				expect(response.body).toEqual({
					error: 'waiting_list_full',
					message: `Room '${roomData.room.roomId}' already has as many waiting participants as it can hold`
				});
			} finally {
				INTERNAL_CONFIG.WAITING_PARTICIPANT_MAX_ENTRIES = maxEntries;
			}
		});

		it('lists a knock never followed by a connection at once and removes it as expired when its time is up', async () => {
			const roomData = await setupLockedRoom();
			const { waitingTicket } = await knock(roomData, 'Ana');
			expect(await waiting(roomData.room.roomId)).toEqual(['Ana']);

			// A sweep that follows a pause, as the first one of a stack left idle, expires nobody for 25 s.
			const deadline = Date.now() + 35_000;

			while ((await waiting(roomData.room.roomId)).length > 0 && Date.now() < deadline) {
				await new Promise((resolve) => setTimeout(resolve, 1_000));
			}

			expect(await waiting(roomData.room.roomId)).toEqual([]);
			expectWaitEnded(
				await askToJoin(roomData.room.roomId, roomData.speakerSecret, 'Ana', waitingTicket),
				MeetWaitingParticipantStatus.EXPIRED
			);
		});
	});

	describe('Joining with the ticket', () => {
		it('answers the same ticket while the wait goes on', async () => {
			const roomData = await setupLockedRoom();
			const { waitingTicket, participant } = await knock(roomData, 'Ana');

			const response = await askToJoin(roomData.room.roomId, roomData.speakerSecret, 'Ana', waitingTicket);

			expect(response.status).toBe(202);
			expect(response.body).toEqual({ waitingTicket, participant });
		});

		it('joins an admitted participant with the identity of the wait, starts the meeting and refuses the ticket after', async () => {
			const roomData = await setupLockedRoom();
			const { roomId } = roomData.room;
			const { waitingTicket, participantIdentity } = await knock(roomData, 'Ana');

			const admitted = await admitWaitingParticipant(roomId, participantIdentity);
			expect(admitted.status).toBe(200);
			expect(admitted.body).toEqual({ message: expect.stringContaining(participantIdentity) });

			const joined = await askToJoin(roomId, roomData.speakerSecret, 'Ana', waitingTicket);
			expect(joined.status).toBe(200);
			expect(identityOf(joined.body.token)).toBe(participantIdentity);
			await waitForMeetingToStart(roomId);

			// The answer lost after the admission was used: asking again with the ticket finds it used
			expectWaitEnded(
				await askToJoin(roomId, roomData.speakerSecret, 'Ana', waitingTicket),
				MeetWaitingParticipantStatus.ADMITTED
			);

			const { token: hostToken } = await startMeetingAsModerator(roomData);
			const { metadata } = jwtDecode<ClaimGrants>(joined.body.token);
			await joinFakeParticipant(roomId, participantIdentity, metadata);
			expect((await kickParticipant(roomId, participantIdentity, hostToken)).status).toBe(200);
			expectWaitEnded(
				await askToJoin(roomId, roomData.speakerSecret, 'Ana', waitingTicket),
				MeetWaitingParticipantStatus.ADMITTED
			);
		});

		it('keeps the role the participant asked with until they join with the role their credential gives then', async () => {
			const roomData = await setupLockedRoom();
			const { roomId } = roomData.room;
			const { member } = await setupRoomMember(roomId, { name: 'Ana', baseRole: MeetRoomMemberRole.SPEAKER });
			const { waitingTicket, participantIdentity } = await knock(roomData, 'Ana', guestSecretOf(member));

			const promoted = await updateRoomMember(roomId, member.memberId, {
				baseRole: MeetRoomMemberRole.MODERATOR
			});
			expect(promoted.status).toBe(200);
			expect((await getWaitingParticipant(roomId, participantIdentity)).body.role).toBe(
				MeetRoomMemberRole.SPEAKER
			);

			expect((await admitWaitingParticipant(roomId, participantIdentity)).status).toBe(200);
			const joined = await askToJoin(roomId, guestSecretOf(member), 'Ana', waitingTicket);
			expect(joined.status).toBe(200);
			const { metadata } = jwtDecode<ClaimGrants>(joined.body.token);
			expect(participantRoleOf(JSON.parse(metadata!).badge)).toBe(MeetRoomMemberRole.MODERATOR);
		});

		it('makes a speaker who was admitted and then kicked wait in the line again', async () => {
			const roomData = await setupLockedRoom();
			const { roomId } = roomData.room;
			const { token: hostToken } = await startMeetingAsModerator(roomData);
			const sam = await knock(roomData, 'Sam');
			expect((await admitWaitingParticipant(roomId, sam.participantIdentity)).status).toBe(200);
			const joined = await askToJoin(roomId, roomData.speakerSecret, 'Sam', sam.waitingTicket);
			const { sub, metadata } = jwtDecode<ClaimGrants>(joined.body.token);
			await joinFakeParticipant(roomId, sub!, metadata);
			expect((await kickParticipant(roomId, sub!, hostToken)).status).toBe(200);

			await knock(roomData, 'Sam');

			expect(await waiting(roomId)).toEqual(['Sam']);
		});

		it('makes an admitted participant who finds the meeting full wait again', async () => {
			const roomData = await setupLockedRoom(1);
			const { roomId } = roomData.room;
			const ana = await knock(roomData, 'Ana');
			await knock(roomData, 'Bob');
			expect((await admitWaitingParticipant(roomId, ana.participantIdentity)).status).toBe(200);
			await startMeetingAsModerator(roomData);

			const response = await askToJoin(roomId, roomData.speakerSecret, 'Ana', ana.waitingTicket);

			expect(response.status).toBe(202);
			expect(response.body).toEqual({ waitingTicket: ana.waitingTicket, participant: ana.participant });
			expect(await waiting(roomId)).toEqual(['Ana', 'Bob']);
		});

		it('answers 409 with the outcome to the ticket of a wait that ended, and without one to an unknown ticket', async () => {
			const roomData = await setupLockedRoom();
			const otherRoom = await setupLockedRoom();
			const { roomId } = roomData.room;
			const rejected = await knock(roomData, 'Ana');
			const left = await knock(roomData, 'Bob');
			const elsewhere = await knock(otherRoom, 'Carla');

			expect((await rejectWaitingParticipant(roomId, rejected.participantIdentity)).status).toBe(200);
			expect((await leaveWaiting(roomId, left.waitingTicket)).status).toBe(204);

			const ask = (waitingTicket: string) => askToJoin(roomId, roomData.speakerSecret, 'Ana', waitingTicket);
			expectWaitEnded(await ask(rejected.waitingTicket), MeetWaitingParticipantStatus.REJECTED);
			expectWaitEnded(await ask(left.waitingTicket), MeetWaitingParticipantStatus.LEFT);
			expectWaitEnded(await ask('unknown-ticket'));
			expectWaitEnded(await ask(elsewhere.waitingTicket));
		});

		it('expires the wait of a page that closed, and refuses another reason', async () => {
			const roomData = await setupLockedRoom();
			const { roomId } = roomData.room;
			const ana = await knock(roomData, 'Ana');

			expect((await leaveWaiting(roomId, ana.waitingTicket, 'replaced')).status).toBe(422);
			expect((await leaveWaiting(roomId, ana.waitingTicket, 'page_closed')).status).toBe(204);

			expect(await waiting(roomId)).toEqual([]);
			expectWaitEnded(
				await askToJoin(roomId, roomData.speakerSecret, 'Ana', ana.waitingTicket),
				MeetWaitingParticipantStatus.EXPIRED
			);
		});
	});

	describe('Admitting and rejecting', () => {
		it('lists the participants waiting, and nobody in an unlocked room', async () => {
			const roomData = await setupLockedRoom();
			await knock(roomData, 'Ana');
			await knock(roomData, 'Bob');

			expect(await waiting(roomData.room.roomId)).toEqual(['Ana', 'Bob']);

			const unlocked = await setupSingleRoom(false, 'UNLOCKED_ROOM');
			expect((await getWaitingParticipants(unlocked.room.roomId)).body).toEqual({ participants: [] });
		});

		it('gets one participant while they wait, and answers 404 once they no longer do', async () => {
			const roomData = await setupLockedRoom();
			const { roomId } = roomData.room;
			const { participant, participantIdentity } = await knock(roomData, 'Ana');

			const found = await getWaitingParticipant(roomId, participantIdentity);
			expect(found.status).toBe(200);
			expect(found.body).toEqual(participant);

			expect((await admitWaitingParticipant(roomId, participantIdentity)).status).toBe(200);
			const gone = await getWaitingParticipant(roomId, participantIdentity);
			expect(gone.status).toBe(404);
			expect(gone.body).toMatchObject({ error: 'participant_not_waiting', participantIdentity });
		});

		it('admits everyone waiting when they all fit, with no meeting running', async () => {
			const roomData = await setupLockedRoom(3);
			const { roomId } = roomData.room;
			const waiters = [
				await knock(roomData, 'Ana'),
				await knock(roomData, 'Bob'),
				await knock(roomData, 'Carla')
			];

			const response = await admitAllWaitingParticipants(roomId);

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ message: `Waiting participants admitted to room '${roomId}'` });
			expect(await waiting(roomId)).toEqual([]);

			for (const { participant, waitingTicket } of waiters) {
				const join = await askToJoin(
					roomId,
					roomData.speakerSecret,
					participant.participantName,
					waitingTicket
				);
				expect(join.status).toBe(200);
			}
		});

		it('admits nobody when everyone waiting does not fit, counting the admissions not used yet', async () => {
			const roomData = await setupLockedRoom(2);
			const { roomId } = roomData.room;
			const ana = await knock(roomData, 'Ana');
			await knock(roomData, 'Bob');
			await knock(roomData, 'Carla');
			expect((await admitWaitingParticipant(roomId, ana.participantIdentity)).status).toBe(200);

			const response = await admitAllWaitingParticipants(roomId);

			expect(response.status).toBe(409);
			expect(response.body).toEqual({
				error: 'not_enough_places',
				message: `The meeting of room '${roomId}' has fewer free places than participants to admit`
			});
			expect(await waiting(roomId)).toEqual(['Bob', 'Carla']);
		});

		it('admits one participant, and refuses one who does not wait or finds no free place', async () => {
			const roomData = await setupLockedRoom(1);
			const { roomId } = roomData.room;
			const ana = await knock(roomData, 'Ana');
			const bob = await knock(roomData, 'Bob');

			const notWaiting = await admitWaitingParticipant(roomId, 'ghost-1');
			expect(notWaiting.status).toBe(404);
			expect(notWaiting.body).toMatchObject({ error: 'participant_not_waiting', participantIdentity: 'ghost-1' });

			expect((await admitWaitingParticipant(roomId, ana.participantIdentity)).status).toBe(200);
			const noPlace = await admitWaitingParticipant(roomId, bob.participantIdentity);
			expect(noPlace.status).toBe(409);
			expect(noPlace.body.error).toBe('not_enough_places');
			expect(await waiting(roomId)).toEqual(['Bob']);
		});

		it('admits one of two concurrent admissions for the last place', async () => {
			const roomData = await setupLockedRoom(1);
			const { roomId } = roomData.room;
			const ana = await knock(roomData, 'Ana');
			const bob = await knock(roomData, 'Bob');

			const statuses = await Promise.all([
				admitWaitingParticipant(roomId, ana.participantIdentity),
				admitWaitingParticipant(roomId, bob.participantIdentity)
			]).then((responses) => responses.map(({ status }) => status).sort());

			expect(statuses).toEqual([200, 409]);
		});

		it('rejects every participant named in bulk, ending the wait of each one', async () => {
			const roomData = await setupLockedRoom();
			const { roomId } = roomData.room;
			const ana = await knock(roomData, 'Ana');
			const bob = await knock(roomData, 'Bob');
			await knock(roomData, 'Carla');

			const response = await bulkRejectWaitingParticipants(roomId, [
				ana.participantIdentity,
				bob.participantIdentity
			]);

			expect(response.status).toBe(200);
			expect(response.body).toEqual({
				message: 'All waiting participants rejected successfully',
				deleted: [ana.participantIdentity, bob.participantIdentity],
				failed: []
			});
			expect(await waiting(roomId)).toEqual(['Carla']);
			expectWaitEnded(
				await askToJoin(roomId, roomData.speakerSecret, 'Ana', ana.waitingTicket),
				MeetWaitingParticipantStatus.REJECTED
			);
		});

		it('rejects in bulk those who wait and answers 400 listing the others', async () => {
			const roomData = await setupLockedRoom();
			const { roomId } = roomData.room;
			const ana = await knock(roomData, 'Ana');
			const bob = await knock(roomData, 'Bob');
			expect((await admitWaitingParticipant(roomId, bob.participantIdentity)).status).toBe(200);

			const response = await bulkRejectWaitingParticipants(roomId, [
				ana.participantIdentity,
				bob.participantIdentity,
				'ghost-1'
			]);

			expect(response.status).toBe(400);
			expect(response.body).toEqual({
				message: '2 waiting participant(s) could not be rejected',
				deleted: [ana.participantIdentity],
				failed: [bob.participantIdentity, 'ghost-1'].map((participantIdentity) => ({
					participantIdentity,
					error: `Participant '${participantIdentity}' is not waiting in room '${roomId}'`
				}))
			});
			expect(await waiting(roomId)).toEqual([]);
		});

		it('rejects a participant once when a bulk and a single rejection of them run at the same time', async () => {
			const roomData = await setupLockedRoom();
			const { roomId } = roomData.room;
			const ana = await knock(roomData, 'Ana');

			const [bulk, single] = await Promise.all([
				bulkRejectWaitingParticipants(roomId, [ana.participantIdentity]),
				rejectWaitingParticipant(roomId, ana.participantIdentity)
			]);

			expect([
				{ bulk: 200, single: 404 },
				{ bulk: 400, single: 200 }
			]).toContainEqual({ bulk: bulk.status, single: single.status });
		});

		it('answers 422 to a bulk rejection naming nobody or more than 100 participants', async () => {
			const { roomId } = (await setupLockedRoom()).room;
			const tooMany = Array.from({ length: 101 }, (_, i) => `ghost-${i}`);

			expect((await bulkRejectWaitingParticipants(roomId, [])).status).toBe(422);
			expect((await bulkRejectWaitingParticipants(roomId, [' ', ' '])).status).toBe(422);
			expect((await bulkRejectWaitingParticipants(roomId, tooMany)).status).toBe(422);
		});

		it('rejects one participant, and answers 404 for one who does not wait', async () => {
			const roomData = await setupLockedRoom();
			const { roomId } = roomData.room;
			const ana = await knock(roomData, 'Ana');
			await knock(roomData, 'Bob');

			const response = await rejectWaitingParticipant(roomId, ana.participantIdentity);

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ message: expect.stringContaining(ana.participantIdentity) });
			expect(await waiting(roomId)).toEqual(['Bob']);
			expect((await rejectWaitingParticipant(roomId, ana.participantIdentity)).status).toBe(404);
		});

		it('decides on nobody in an unlocked room', async () => {
			const roomData = await setupSingleRoom(false, 'UNLOCKED_ROOM');
			const { roomId } = roomData.room;

			expect((await admitWaitingParticipant(roomId, 'ana-1')).status).toBe(404);
			const admitAll = await admitAllWaitingParticipants(roomId);
			expect(admitAll.status).toBe(200);
			expect(admitAll.body).toEqual({ message: `Waiting participants admitted to room '${roomId}'` });
			const bulk = await bulkRejectWaitingParticipants(roomId, ['ana-1']);
			expect(bulk.status).toBe(400);
			expect(bulk.body).toMatchObject({ deleted: [], failed: [{ participantIdentity: 'ana-1' }] });
		});

		it('answers 204 to a leave with the ticket of another room, which changes nothing', async () => {
			const roomData = await setupLockedRoom();
			const otherRoom = await setupLockedRoom();
			const { waitingTicket } = await knock(roomData, 'Ana');

			expect((await leaveWaiting(otherRoom.room.roomId, waitingTicket)).status).toBe(204);
			expect(await waiting(roomData.room.roomId)).toEqual(['Ana']);
		});
	});

	describe('Reading the meeting with the waiting participants', () => {
		it('returns the participants waiting, as the list returns them, to a holder of waitingParticipantAdmin', async () => {
			const { roomId, hostToken } = await setupMeetingWithWaiter();

			const response = await getMeeting(roomId, hostToken, { query: 'waitingParticipants' });

			expect(response.status).toBe(200);
			expect(waitingNames(response.body.waitingParticipants)).toEqual(['Ana']);
			expect(response.body.waitingParticipants).toEqual((await getWaitingParticipants(roomId)).body.participants);
			expect(response.body.participants).toBeUndefined();
		});

		it('answers 200 with the participants and no waiting list to a token without waitingParticipantAdmin', async () => {
			const { roomId, speakerToken } = await setupMeetingWithWaiter();

			const response = await getMeeting(roomId, speakerToken, { query: 'participants,waitingParticipants' });

			expect(response.status).toBe(200);
			expect(response.body.participants).toHaveLength(2);
			expect(response.body).not.toHaveProperty('waitingParticipants');
			expect(response.body._extraFields).toEqual(['participants', 'waitingParticipants']);
		});

		it('returns the participants waiting to the API key', async () => {
			const { roomId } = await setupMeetingWithWaiter();

			const response = await getMeeting(roomId, undefined, { header: 'waitingParticipants' });

			expect(response.status).toBe(200);
			expect(waitingNames(response.body.waitingParticipants)).toEqual(['Ana']);
		});

		it('returns an empty list in an unlocked room', async () => {
			const roomData = await setupSingleRoom(true, 'UNLOCKED_ROOM');

			const response = await getMeeting(roomData.room.roomId, roomData.moderatorToken, {
				query: 'waitingParticipants'
			});

			expect(response.status).toBe(200);
			expect(response.body.waitingParticipants).toEqual([]);
		});

		it('answers 404 while no meeting runs, although the list returns who waits', async () => {
			const roomData = await setupLockedRoom();
			const { roomId } = roomData.room;
			await knock(roomData, 'Ana');

			const response = await getMeeting(roomId, undefined, { query: 'waitingParticipants' });

			expect(response.status).toBe(404);
			expect(response.body.message).toContain('no active meeting');
			expect(await waiting(roomId)).toEqual(['Ana']);
		});
	});

	describe('Ending waits', () => {
		it('ends the waits when the meeting is ended, but not a wait started after', async () => {
			const roomData = await setupLockedRoom();
			const { roomId } = roomData.room;
			const { token } = await startMeetingAsModerator(roomData);
			const before = await knock(roomData, 'Ana');

			expect((await endMeeting(roomId, token)).status).toBe(200);
			const after = await knock(roomData, 'Bob');

			expectWaitEnded(
				await askToJoin(roomId, roomData.speakerSecret, 'Ana', before.waitingTicket),
				MeetWaitingParticipantStatus.MEETING_ENDED
			);
			expect((await askToJoin(roomId, roomData.speakerSecret, 'Bob', after.waitingTicket)).status).toBe(202);
		});

		it('keeps the waits of a meeting that empties', async () => {
			const roomData = await setupLockedRoom();
			const { roomId } = roomData.room;
			await startMeetingAsModerator(roomData);
			const { waitingTicket } = await knock(roomData, 'Ana');

			await disconnectFakeParticipants();
			await waitForMeetingToEnd(roomId);

			expect((await askToJoin(roomId, roomData.speakerSecret, 'Ana', waitingTicket)).status).toBe(202);
		});

		it('ends the waits of a room closed at once, and of one closed during a meeting only when it ends', async () => {
			const idle = await setupLockedRoom();
			const idleWait = await knock(idle, 'Ana');

			expect((await updateRoomStatus(idle.room.roomId, MeetRoomStatus.CLOSED)).status).toBe(200);
			expectWaitEnded(
				await askToJoin(idle.room.roomId, idle.speakerSecret, 'Ana', idleWait.waitingTicket),
				MeetWaitingParticipantStatus.ROOM_CLOSED
			);

			const live = await setupLockedRoom();
			const { roomId } = live.room;
			await startMeetingAsModerator(live);
			const liveWait = await knock(live, 'Bob');

			expect((await updateRoomStatus(roomId, MeetRoomStatus.CLOSED)).status).toBe(202);
			expect((await askToJoin(roomId, live.speakerSecret, 'Bob', liveWait.waitingTicket)).status).toBe(202);

			await disconnectFakeParticipants();
			await waitForMeetingToEnd(roomId);
			let response = await askToJoin(roomId, live.speakerSecret, 'Bob', liveWait.waitingTicket);

			for (let attempt = 0; attempt < 20 && response.status === 202; attempt++) {
				await new Promise((resolve) => setTimeout(resolve, 500));
				response = await askToJoin(roomId, live.speakerSecret, 'Bob', liveWait.waitingTicket);
			}

			expect(response.status).toBe(409);
			expect(response.body.status).toBe(MeetWaitingParticipantStatus.ROOM_CLOSED);
		});

		it('ends the waits of a deleted room', async () => {
			const roomData = await setupLockedRoom();
			const { roomId } = roomData.room;
			const { waitingTicket } = await knock(roomData, 'Ana');

			expect((await deleteRoom(roomId)).status).toBe(200);

			const wait = await container.get(WaitingParticipantService).findWait(waitingTicket);
			expect(wait).toMatchObject({ status: MeetWaitingParticipantStatus.ROOM_CLOSED, ended: true });
		});

		it('lets everyone waiting in when the room is unlocked, with the identity they waited with', async () => {
			const roomData = await setupLockedRoom();
			const { roomId } = roomData.room;
			const { waitingTicket, participantIdentity } = await knock(roomData, 'Ana');

			expect((await updateRoomAccessConfig(roomId, { lock: { enabled: false } })).status).toBe(200);
			const response = await askToJoin(roomId, roomData.speakerSecret, 'Ana', waitingTicket);

			expect(response.status).toBe(200);
			expect(identityOf(response.body.token)).toBe(participantIdentity);
		});

		it('keeps waiting a participant whose role gains accessBypassLock', async () => {
			const roomData = await setupLockedRoom();
			const { roomId } = roomData.room;
			const { waitingTicket } = await knock(roomData, 'Ana');

			const response = await updateRoomRoles(roomId, { speaker: { permissions: { accessBypassLock: true } } });
			expect(response.status).toBe(200);

			expect((await askToJoin(roomId, roomData.speakerSecret, 'Ana', waitingTicket)).status).toBe(202);
		});

		it('invalidates the room member tokens issued before the room is locked, as any access update does', async () => {
			const roomData = await setupSingleRoom(false, 'UNLOCKED_ROOM');
			const { roomId } = roomData.room;
			const { rolesUpdatedAt } = (await getRoom(roomId)).body;
			const joined = await askToJoin(roomId, roomData.speakerSecret, 'Ana');
			expect(joined.status).toBe(200);
			await deleteMeetingRoom(roomId);

			expect((await updateRoomAccessConfig(roomId, { lock: { enabled: true } })).status).toBe(200);
			const turnedOn = (await getRoom(roomId)).body.rolesUpdatedAt;
			expect(turnedOn).toBeGreaterThan(rolesUpdatedAt);
			expect((await getRoom(roomId, undefined, undefined, roomData.speakerToken)).status).toBe(401);
			expect((await getRoom(roomId, undefined, undefined, `Bearer ${joined.body.token}`)).status).toBe(401);
			const { sub, metadata } = jwtDecode<ClaimGrants>(joined.body.token);
			await joinFakeParticipantUntilRemoved(roomId, sub!, metadata!);

			expect((await updateRoomAccessConfig(roomId, { lock: { enabled: true, message: 'Soon' } })).status).toBe(
				409
			);
			await deleteMeetingRoom(roomId);
			const tokenAfter = (await askToJoin(roomId, roomData.moderatorSecret, 'Host')).body.token as string;
			await deleteMeetingRoom(roomId);

			expect((await updateRoomAccessConfig(roomId, { lock: { enabled: true, message: 'Soon' } })).status).toBe(
				200
			);
			expect((await getRoom(roomId)).body.rolesUpdatedAt).toBeGreaterThan(turnedOn);
			expect((await getRoom(roomId, undefined, undefined, `Bearer ${tokenAfter}`)).status).toBe(401);
		});
	});

	describe('Realtime connection of the waiter', () => {
		class WaitingParticipantReplica extends WebSocketService {
			readonly app = express();
			readonly httpServer = http.createServer(this.app);

			constructor(readonly redis: RedisService) {
				const logger = new LoggerService();
				super(logger, redis, new RequestSessionService(logger));
				new WaitingParticipantRealtimeHandler(
					this,
					container.get(WaitingParticipantService),
					container.get(WaitingParticipantStateService),
					container.get(RoomRepository),
					logger
				);
			}

			async start(): Promise<void> {
				await new Promise<void>((resolve) => this.httpServer.listen(0, '127.0.0.1', resolve));
				await this.attach(this.httpServer, webSocketHandshakeGuard(this.app));
			}

			url(waitingTicket: string): string {
				const { port } = this.httpServer.address() as AddressInfo;
				return `ws://127.0.0.1:${port}${this.path}?waitingTicket=${encodeURIComponent(waitingTicket)}`;
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
			next(): Promise<MeetWaitingParticipantState>;
			closed: Promise<number>;
		}

		const sockets: WebSocket[] = [];

		const connect = (url: string): Waiter => {
			const socket = new WebSocket(url);
			sockets.push(socket);
			const queue: MeetWaitingParticipantState[] = [];
			const wakers: (() => void)[] = [];
			socket.on('message', (frame) => {
				const message = JSON.parse(String(frame)) as MeetWebSocketMessage<MeetWaitingParticipantState>;

				if (message.type !== MEET_WAITING_PARTICIPANT_STATE_MESSAGE) return;

				queue.push(message.data!);
				wakers.splice(0).forEach((wake) => wake());
			});
			socket.on('error', () => {});
			const next = async (): Promise<MeetWaitingParticipantState> => {
				while (queue.length === 0) await new Promise<void>((wake) => wakers.push(wake));

				return queue.shift()!;
			};
			return { socket, next, closed: new Promise((resolve) => socket.on('close', resolve)) };
		};

		/** The next state with the given status, skipping the earlier ones. */
		const nextWith = async (
			waiter: Waiter,
			status: MeetWaitingParticipantStatus
		): Promise<MeetWaitingParticipantState> => {
			for (;;) {
				const state = await waiter.next();

				if (state.status === status) return state;
			}
		};

		let replicaA: WaitingParticipantReplica;
		let replicaB: WaitingParticipantReplica;

		beforeAll(async () => {
			replicaA = new WaitingParticipantReplica(new RedisService(new LoggerService()));
			replicaB = new WaitingParticipantReplica(new RedisService(new LoggerService()));
			await Promise.all([replicaA.start(), replicaB.start()]);
		});

		afterEach(() => {
			sockets.splice(0).forEach((socket) => socket.terminate());
		});

		afterAll(async () => {
			await Promise.all([replicaA.stop(), replicaB.stop()]);
		});

		it('sends the state on open, holding nothing that identifies the others', async () => {
			const roomData = await setupLockedRoom();
			await knock(roomData, 'Ana');
			const { waitingTicket } = await knock(roomData, 'Bob');
			await updateRoomAccessConfig(roomData.room.roomId, { lock: { enabled: true, message: 'Wait here' } });

			const state = await connect(replicaA.url(waitingTicket)).next();

			expect(state).toEqual({
				status: MeetWaitingParticipantStatus.WAITING,
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
			const roomData = await setupLockedRoom();
			const ana = await knock(roomData, 'Ana');
			const bob = await knock(roomData, 'Bob');
			const anaWaiter = connect(replicaA.url(ana.waitingTicket));
			const bobWaiter = connect(replicaB.url(bob.waitingTicket));
			await nextWith(anaWaiter, MeetWaitingParticipantStatus.WAITING);
			await nextWith(bobWaiter, MeetWaitingParticipantStatus.WAITING);

			await admitWaitingParticipant(roomData.room.roomId, ana.participantIdentity);
			await rejectWaitingParticipant(roomData.room.roomId, bob.participantIdentity);

			expect(await nextWith(anaWaiter, MeetWaitingParticipantStatus.ADMITTED)).toMatchObject({
				status: MeetWaitingParticipantStatus.ADMITTED
			});
			expect(await nextWith(bobWaiter, MeetWaitingParticipantStatus.REJECTED)).toMatchObject({
				status: MeetWaitingParticipantStatus.REJECTED
			});
		});

		it('keeps waiting a waiter who reconnects through another replica, and tells one who leaves', async () => {
			const roomData = await setupLockedRoom();
			await knock(roomData, 'Ana');
			const { waitingTicket } = await knock(roomData, 'Bob');
			const first = connect(replicaA.url(waitingTicket));
			await nextWith(first, MeetWaitingParticipantStatus.WAITING);
			first.socket.terminate();

			const again = connect(replicaB.url(waitingTicket));
			expect(await again.next()).toMatchObject({ status: MeetWaitingParticipantStatus.WAITING });

			await leaveWaiting(roomData.room.roomId, waitingTicket);
			expect(await nextWith(again, MeetWaitingParticipantStatus.LEFT)).toMatchObject({
				status: MeetWaitingParticipantStatus.LEFT
			});
			expect(await waiting(roomData.room.roomId)).toEqual(['Ana']);
		});

		it('reports a rejection made while the waiter was disconnected, starting no new wait', async () => {
			const roomData = await setupLockedRoom();
			const { waitingTicket, participantIdentity } = await knock(roomData, 'Ana');
			await rejectWaitingParticipant(roomData.room.roomId, participantIdentity);

			expect(await connect(replicaA.url(waitingTicket)).next()).toMatchObject({
				status: MeetWaitingParticipantStatus.REJECTED
			});
			expect(await waiting(roomData.room.roomId)).toEqual([]);
		});

		it('sends a final state whose push was lost at the next answered ping', async () => {
			const roomData = await setupLockedRoom();
			const { waitingTicket } = await knock(roomData, 'Ana');
			const waiter = connect(replicaA.url(waitingTicket));
			await nextWith(waiter, MeetWaitingParticipantStatus.WAITING);

			await container
				.get(WaitingParticipantStateService)
				.end(roomData.room.roomId, MeetWaitingParticipantStatus.REJECTED);
			replicaA.ping();

			expect(await nextWith(waiter, MeetWaitingParticipantStatus.REJECTED)).toMatchObject({
				status: MeetWaitingParticipantStatus.REJECTED
			});
		});

		it('ends at the next answered ping the waits of a room closed or unlocked whose waits were not ended', async () => {
			const closedRoom = await setupLockedRoom();
			const switchedOff = await setupLockedRoom();
			const closedWaiter = connect(replicaA.url((await knock(closedRoom, 'Ana')).waitingTicket));
			const letInWaiter = connect(replicaA.url((await knock(switchedOff, 'Bob')).waitingTicket));
			await nextWith(closedWaiter, MeetWaitingParticipantStatus.WAITING);
			await nextWith(letInWaiter, MeetWaitingParticipantStatus.WAITING);

			const roomRepository = container.get(RoomRepository);
			const { access } = (await roomRepository.findByRoomId(switchedOff.room.roomId))!;
			await roomRepository.updatePartial(closedRoom.room.roomId, { status: MeetRoomStatus.CLOSED });
			await roomRepository.updatePartial(switchedOff.room.roomId, {
				access: { ...access, lock: { enabled: false } }
			});
			replicaA.ping();

			expect(await nextWith(closedWaiter, MeetWaitingParticipantStatus.ROOM_CLOSED)).toMatchObject({
				status: MeetWaitingParticipantStatus.ROOM_CLOSED
			});
			expect(await nextWith(letInWaiter, MeetWaitingParticipantStatus.ADMITTED)).toMatchObject({
				status: MeetWaitingParticipantStatus.ADMITTED
			});
		});

		it('tells the earlier wait of an identity that asks again that it left', async () => {
			const roomData = await setupLockedRoom();
			const { member } = await setupRoomMember(roomData.room.roomId, {
				name: 'Ana',
				baseRole: MeetRoomMemberRole.SPEAKER
			});
			const first = await knock(roomData, 'Ana', guestSecretOf(member));
			const waiter = connect(replicaA.url(first.waitingTicket));
			await nextWith(waiter, MeetWaitingParticipantStatus.WAITING);

			await knock(roomData, 'Ana', guestSecretOf(member));

			expect(await nextWith(waiter, MeetWaitingParticipantStatus.LEFT)).toMatchObject({
				status: MeetWaitingParticipantStatus.LEFT
			});
		});

		it('removes as expired a page closed and an admission never used', async () => {
			const roomData = await setupLockedRoom();
			const { roomId } = roomData.room;
			const ana = await knock(roomData, 'Ana');
			const bob = await knock(roomData, 'Bob');
			const closedPage = connect(replicaA.url(ana.waitingTicket));
			await nextWith(closedPage, MeetWaitingParticipantStatus.WAITING);
			const admittedPage = connect(replicaB.url(bob.waitingTicket));
			await nextWith(admittedPage, MeetWaitingParticipantStatus.WAITING);
			closedPage.socket.close();
			await admitWaitingParticipant(roomId, bob.participantIdentity);
			await nextWith(admittedPage, MeetWaitingParticipantStatus.ADMITTED);

			expect(await nextWith(admittedPage, MeetWaitingParticipantStatus.EXPIRED)).toMatchObject({
				status: MeetWaitingParticipantStatus.EXPIRED
			});
			const waitingParticipantService = container.get(WaitingParticipantService);
			await expect(waitingParticipantService.findWait(ana.waitingTicket)).resolves.toMatchObject({
				status: MeetWaitingParticipantStatus.EXPIRED,
				ended: true
			});
			expect((await getWaitingParticipants(roomId)).body).toEqual({ participants: [] });
		});
	});
});
