import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import {
	MeetAssistantCapabilityName,
	MeetParticipantModerationAction,
	MeetRoomMemberRole,
	MeetRoomMemberTokenMetadata,
	MeetRoomMemberUIBadge
} from '@openvidu-meet/typings';
import { Express } from 'express';
import { jwtDecode } from 'jwt-decode';
import type { ClaimGrants } from 'livekit-server-sdk';
import request from 'supertest';
import { INTERNAL_CONFIG } from '../../../../src/config/internal-config.js';
import { MEET_ENV } from '../../../../src/environment.js';
import {
	errorBroadcastDisabled,
	errorInsufficientPermissions,
	errorInvalidToken,
	errorUnauthorized
} from '../../../../src/models/error.model.js';
import { expectMeetError } from '../../../helpers/assertion-helpers.js';
import {
	disconnectFakeParticipants,
	joinFakeParticipant,
	updateParticipantMetadata
} from '../../../helpers/livekit-cli-helpers.js';
import {
	admitFromLobby,
	askToJoin,
	createAssistant,
	deleteAllRooms,
	generateRoomMemberToken,
	getFullPath,
	getLobby,
	loginRootAdmin,
	refreshRoomMemberTokenRequest,
	startTestServer,
	stopAllRecordings
} from '../../../helpers/request-helpers.js';

import {
	guestSecretOf,
	setupRoomMember,
	setupSingleRoom,
	updateRoomMemberPermissions
} from '../../../helpers/test-scenarios.js';
import { waitForMeetingToStart } from '../../../helpers/wait-helpers.js';
import { RoomData, RoomMemberData } from '../../../interfaces/scenarios.js';

const MEETINGS_PATH = getFullPath(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/meetings`);
const BROADCASTS_PATH = getFullPath(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/broadcasts`);
const ASSISTANTS_PATH = getFullPath(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/ai/assistants`);
const LIVE_CAPTIONS_BODY = { capabilities: [{ name: MeetAssistantCapabilityName.LIVE_CAPTIONS }] };

describe('Meeting API Security Tests', () => {
	const participantIdentity = 'TEST_PARTICIPANT';

	let app: Express;
	let rootAdminAccessToken: string;

	let roomData: RoomData;
	let roomId: string;
	let roomMember: RoomMemberData;

	beforeAll(async () => {
		app = await startTestServer();
		({ accessToken: rootAdminAccessToken } = await loginRootAdmin());

		roomData = await setupSingleRoom(true);
		roomId = roomData.room.roomId;
		roomMember = await setupRoomMember(roomId, {
			name: 'Identified Guest',
			baseRole: MeetRoomMemberRole.MODERATOR
		});
	});

	afterAll(async () => {
		await disconnectFakeParticipants();
		await deleteAllRooms();
	});

	describe('End Meeting Tests', () => {
		it('should succeed when request includes API key', async () => {
			const response = await request(app)
				.delete(`${MEETINGS_PATH}/${roomId}`)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY);
			expect(response.status).toBe(200);

			// Re-join participant for further tests
			await joinFakeParticipant(roomId, participantIdentity);
		});

		it('should fail when using access token', async () => {
			const response = await request(app)
				.delete(`${MEETINGS_PATH}/${roomId}`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, rootAdminAccessToken);
			expectMeetError(response, errorUnauthorized());
		});

		it('should succeed when using room member token with meetingEnd permission', async () => {
			// Update room member to have meetingEnd permission
			roomMember = await updateRoomMemberPermissions(roomId, roomMember.member.memberId, { meetingEnd: true });

			const response = await request(app)
				.delete(`${MEETINGS_PATH}/${roomId}`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
			expect(response.status).toBe(200);

			// Re-join participant for further tests
			await joinFakeParticipant(roomId, participantIdentity);
		});

		it('should fail when using room member token without meetingEnd permission', async () => {
			// Update room member to not have meetingEnd permission
			roomMember = await updateRoomMemberPermissions(roomId, roomMember.member.memberId, {
				meetingEnd: false
			});

			const response = await request(app)
				.delete(`${MEETINGS_PATH}/${roomId}`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
			expectMeetError(response, errorInsufficientPermissions());
		});

		it('should fail when using room member token from a different room', async () => {
			const newRoomData = await setupSingleRoom();

			const response = await request(app)
				.delete(`${MEETINGS_PATH}/${roomId}`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, newRoomData.moderatorToken);
			expectMeetError(response, errorInsufficientPermissions());
		});
	});

	describe('Broadcast Tests', () => {
		const startBroadcastWith = (set: [string, string], body: object = {}) =>
			request(app)
				.post(BROADCASTS_PATH)
				.set(...set)
				.send({ roomId, ...body });

		it('should pass the authentication when request includes API key', async () => {
			const response = await startBroadcastWith([INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY]);
			// Broadcast is disabled in the room, which is a permission-layer answer, not an authentication one
			expect(response.status).toBe(403);
			expect(response.body.error).toBe('Broadcast Error');
		});

		it('should fail when using access token', async () => {
			const response = await startBroadcastWith([INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, rootAdminAccessToken]);
			expectMeetError(response, errorUnauthorized());
		});

		it('should fail when using room member token without broadcastControl permission', async () => {
			roomMember = await updateRoomMemberPermissions(roomId, roomMember.member.memberId, {
				broadcastControl: false
			});

			const response = await startBroadcastWith([
				INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER,
				roomMember.memberToken
			]);
			expectMeetError(response, errorInsufficientPermissions());
		});

		it('should fail to start to a destination of this meeting without broadcastEdit', async () => {
			roomMember = await updateRoomMemberPermissions(roomId, roomMember.member.memberId, {
				broadcastControl: true,
				broadcastEdit: false
			});
			const memberHeader: [string, string] = [INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken];

			expectMeetError(
				await startBroadcastWith(memberHeader, {
					destinationIds: ['room-destination'],
					destinations: [{ name: 'Extra', url: 'rtmp://rtmp-sink.invalid/live/key' }]
				}),
				errorInsufficientPermissions()
			);
			// Room destinations need no more than broadcastControl, so the request goes on to the
			// room's own checks: this room has live broadcast disabled.
			expectMeetError(
				await startBroadcastWith(memberHeader, { destinationIds: ['room-destination'] }),
				errorBroadcastDisabled(roomId)
			);
		});

		it('should list the broadcasts with any room member token that may read the meeting', async () => {
			const response = await request(app)
				.get(BROADCASTS_PATH)
				.query({ roomId })
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomData.speakerToken);
			expect(response.status).toBe(200);
			expect(response.body).toEqual({ broadcasts: [] });
		});

		it('should fail when using room member token from a different room', async () => {
			const newRoomData = await setupSingleRoom();

			const response = await startBroadcastWith([
				INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER,
				newRoomData.moderatorToken
			]);
			expectMeetError(response, errorInsufficientPermissions());
		});
	});

	describe('Update Participant in Meeting Tests', () => {
		const action = MeetParticipantModerationAction.UPGRADE;

		const setParticipantMetadata = async () => {
			const metadata: MeetRoomMemberTokenMetadata = {
				iat: Date.now(),
				roomId,
				permissions: roomData.room.roles.speaker.permissions,
				badge: MeetRoomMemberUIBadge.OTHER,
				livekitUrl: MEET_ENV.LIVEKIT_URL
			};
			await updateParticipantMetadata(roomId, participantIdentity, metadata);
		};

		beforeAll(async () => {
			// Ensure participant has the correct metadata before tests
			await setParticipantMetadata();
		});

		it('should succeed when request includes API key', async () => {
			const response = await request(app)
				.put(`${MEETINGS_PATH}/${roomId}/participants/${participantIdentity}/role`)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY)
				.send({ action });
			expect(response.status).toBe(200);

			// Restore the participant's original metadata for further tests
			await setParticipantMetadata();
		});

		it('should fail when using access token', async () => {
			const response = await request(app)
				.put(`${MEETINGS_PATH}/${roomId}/participants/${participantIdentity}/role`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, rootAdminAccessToken)
				.send({ action });
			expectMeetError(response, errorUnauthorized());
		});

		it('should succeed when using room member token with participantPromote permission', async () => {
			// Update room member to have participantPromote permission
			roomMember = await updateRoomMemberPermissions(roomId, roomMember.member.memberId, {
				participantPromote: true
			});

			const response = await request(app)
				.put(`${MEETINGS_PATH}/${roomId}/participants/${participantIdentity}/role`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken)
				.send({ action });
			expect(response.status).toBe(200);

			// Re-join participant for further tests
			await joinFakeParticipant(roomId, participantIdentity);
			await setParticipantMetadata();
		});

		it('should fail when using room member token without participantPromote permission', async () => {
			// Update room member to not have participantPromote permission
			roomMember = await updateRoomMemberPermissions(roomId, roomMember.member.memberId, {
				participantPromote: false
			});

			const response = await request(app)
				.put(`${MEETINGS_PATH}/${roomId}/participants/${participantIdentity}/role`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken)
				.send({ action });
			expectMeetError(response, errorInsufficientPermissions());
		});

		it('should fail when using room member token from a different room', async () => {
			const newRoomData = await setupSingleRoom();

			const response = await request(app)
				.put(`${MEETINGS_PATH}/${roomId}/participants/${participantIdentity}/role`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, newRoomData.moderatorToken)
				.send({ action });
			expectMeetError(response, errorInsufficientPermissions());
		});
	});

	describe('Kick Participant from Meeting Tests', () => {
		it('should succeed when request includes API key', async () => {
			const response = await request(app)
				.delete(`${MEETINGS_PATH}/${roomId}/participants/${participantIdentity}`)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY);
			expect(response.status).toBe(200);

			// Re-join participant for further tests
			await joinFakeParticipant(roomId, participantIdentity);
		});

		it('should fail when using access token', async () => {
			const response = await request(app)
				.delete(`${MEETINGS_PATH}/${roomId}/participants/${participantIdentity}`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, rootAdminAccessToken);
			expectMeetError(response, errorUnauthorized());
		});

		it('should succeed when using room member token with participantKick permission', async () => {
			// Update room member to have participantKick permission
			roomMember = await updateRoomMemberPermissions(roomId, roomMember.member.memberId, {
				participantKick: true
			});

			const response = await request(app)
				.delete(`${MEETINGS_PATH}/${roomId}/participants/${participantIdentity}`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
			expect(response.status).toBe(200);

			// Re-join participant for further tests
			await joinFakeParticipant(roomId, participantIdentity);
		});

		it('should fail when using room member token without participantKick permission', async () => {
			// Update room member to not have participantKick permission
			roomMember = await updateRoomMemberPermissions(roomId, roomMember.member.memberId, {
				participantKick: false
			});

			const response = await request(app)
				.delete(`${MEETINGS_PATH}/${roomId}/participants/${participantIdentity}`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
			expectMeetError(response, errorInsufficientPermissions());
		});

		it('should fail when using room member token from a different room', async () => {
			const newRoomData = await setupSingleRoom();

			const response = await request(app)
				.delete(`${MEETINGS_PATH}/${roomId}/participants/${participantIdentity}`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, newRoomData.moderatorToken);
			expectMeetError(response, errorInsufficientPermissions());
		});

		it('should not reveal to a room member token of another room whether a room exists', async () => {
			const response = await request(app)
				.delete(`${MEETINGS_PATH}/non-existing-room-id/participants/${participantIdentity}`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
			expectMeetError(response, errorInsufficientPermissions());
		});
	});

	// The member's base role is MODERATOR, which grants all three gates, so only the denial carries
	// signal: an ignored deprecated key would leave the moderator default in place and the request
	// would succeed. Every request here is rejected before its controller, so the meeting and its
	// participant are left untouched.
	describe('Deprecated permission spellings', () => {
		it('should deny ending the meeting when canEndMeeting is denied', async () => {
			roomMember = await updateRoomMemberPermissions(roomId, roomMember.member.memberId, {
				canEndMeeting: false
			});

			const response = await request(app)
				.delete(`${MEETINGS_PATH}/${roomId}`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
			expectMeetError(response, errorInsufficientPermissions());
		});

		it('should deny promoting a participant when canMakeModerator is denied', async () => {
			roomMember = await updateRoomMemberPermissions(roomId, roomMember.member.memberId, {
				canMakeModerator: false
			});

			const response = await request(app)
				.put(`${MEETINGS_PATH}/${roomId}/participants/${participantIdentity}/role`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken)
				.send({ action: MeetParticipantModerationAction.UPGRADE });
			expectMeetError(response, errorInsufficientPermissions());
		});

		it('should deny kicking a participant when canKickParticipants is denied', async () => {
			roomMember = await updateRoomMemberPermissions(roomId, roomMember.member.memberId, {
				canKickParticipants: false
			});

			const response = await request(app)
				.delete(`${MEETINGS_PATH}/${roomId}/participants/${participantIdentity}`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
			expectMeetError(response, errorInsufficientPermissions());
		});
	});

	describe('AI Assistant Tests', () => {
		const MOCK_DISPATCH_ID = 'dispatch-test-001';

		describe('Create Assistant Security Tests', () => {
			it('should fail when no room member token header is provided', async () => {
				const response = await request(app).post(ASSISTANTS_PATH).send(LIVE_CAPTIONS_BODY);

				expectMeetError(response, errorUnauthorized());
			});

			it('should fail when the room member token is malformed', async () => {
				const response = await request(app)
					.post(ASSISTANTS_PATH)
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, 'Bearer this.is.not.a.valid.jwt')
					.send(LIVE_CAPTIONS_BODY);

				expectMeetError(response, errorInvalidToken());
			});

			it('should read a token header without the Bearer prefix as no credentials at all', async () => {
				const response = await request(app)
					.post(ASSISTANTS_PATH)
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, 'random-garbage-token')
					.send(LIVE_CAPTIONS_BODY);

				expectMeetError(response, errorUnauthorized());
			});

			it('should fail when the token belongs to a room that no longer exists', async () => {
				const orphanedToken = await generateRoomMemberToken(roomData.room.roomId, {
					secret: roomData.speakerSecret
				});
				await deleteAllRooms();

				const response = await createAssistant(orphanedToken);

				expectMeetError(response, errorInvalidToken());
			});
		});

		describe('Cancel Assistant Security Tests', () => {
			it('should fail when no room member token header is provided', async () => {
				const response = await request(app).delete(`${ASSISTANTS_PATH}/${MOCK_DISPATCH_ID}`);

				expectMeetError(response, errorUnauthorized());
			});

			it('should fail when the room member token is malformed', async () => {
				const response = await request(app)
					.delete(`${ASSISTANTS_PATH}/${MOCK_DISPATCH_ID}`)
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, 'Bearer malformed.token.here');

				expectMeetError(response, errorInvalidToken());
			});

			it('should read a token header without the Bearer prefix as no credentials at all', async () => {
				const response = await request(app)
					.delete(`${ASSISTANTS_PATH}/${MOCK_DISPATCH_ID}`)
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, 'garbage');

				expectMeetError(response, errorUnauthorized());
			});
		});
	});

	describe('Waiting room Tests', () => {
		const RECORDINGS_PATH = getFullPath(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/recordings`);

		let lobbyRoomId: string;
		let lobbyRoom: RoomData;
		let waitingAdmitter: RoomMemberData;
		let admittedToken: string;
		let hostToken: string;
		let demotedToken: string;

		/** Joins the meeting with the identity and metadata of a join token, as its client would. */
		const connectWith = async (token: string) => {
			const { sub, metadata } = jwtDecode<ClaimGrants>(token);
			await joinFakeParticipant(lobbyRoomId, sub!, metadata);
			return sub!;
		};

		/** Asks to join with a link, is admitted with the API key and joins with the ticket. */
		const joinThroughTheLine = async (secret: string, name: string) => {
			const { body: wait } = await askToJoin(lobbyRoomId, secret, name);
			expect((await admitFromLobby(lobbyRoomId, [wait.participantIdentity])).status).toBe(200);
			const joined = await askToJoin(lobbyRoomId, secret, name, wait.lobbyTicket);
			expect(joined.status).toBe(200);
			return joined.body.token as string;
		};

		const meetingRequests = (token: string) => [
			request(app).get(`${MEETINGS_PATH}/${lobbyRoomId}`).set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, token),
			request(app)
				.get(`${MEETINGS_PATH}/${lobbyRoomId}/participants`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, token),
			request(app)
				.get(BROADCASTS_PATH)
				.query({ roomId: lobbyRoomId })
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, token)
		];

		const startRecordingWith = (token: string) =>
			request(app)
				.post(RECORDINGS_PATH)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, token)
				.send({ roomId: lobbyRoomId });

		beforeAll(async () => {
			lobbyRoom = await setupSingleRoom(false, 'LOBBY_ROOM', { lobby: { enabled: true } });
			lobbyRoomId = lobbyRoom.room.roomId;
			waitingAdmitter = await setupRoomMember(lobbyRoomId, {
				name: 'Waiting Admitter',
				baseRole: MeetRoomMemberRole.MODERATOR,
				customPermissions: { lobbyBypass: false }
			});

			const host = await askToJoin(lobbyRoomId, lobbyRoom.moderatorSecret, 'Host');
			hostToken = `Bearer ${host.body.token}`;
			await connectWith(host.body.token);
			await waitForMeetingToStart(lobbyRoomId);

			const admitted = await joinThroughTheLine(guestSecretOf(waitingAdmitter.member), 'Waiting Admitter');
			admittedToken = `Bearer ${admitted}`;
			await connectWith(admitted);

			const demoted = await joinThroughTheLine(lobbyRoom.speakerSecret, 'Demoted');
			const demotedIdentity = await connectWith(demoted);

			for (const action of [MeetParticipantModerationAction.UPGRADE, MeetParticipantModerationAction.DOWNGRADE]) {
				const response = await request(app)
					.put(`${MEETINGS_PATH}/${lobbyRoomId}/participants/${demotedIdentity}/role`)
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, hostToken)
					.send({ action });
				expect(response.status).toBe(200);
			}

			const renewed = await refreshRoomMemberTokenRequest(lobbyRoomId, `Bearer ${demoted}`);
			expect(renewed.status).toBe(200);
			demotedToken = `Bearer ${renewed.body.token}`;
		});

		afterAll(async () => {
			await stopAllRecordings();
		});

		it('should fail to act on the meeting with a room member token minted without joining', async () => {
			const responses = await Promise.all([
				...meetingRequests(waitingAdmitter.memberToken),
				startRecordingWith(waitingAdmitter.memberToken),
				getLobby(lobbyRoomId, waitingAdmitter.memberToken)
			]);

			responses.forEach((response) => expectMeetError(response, errorInsufficientPermissions()));
		});

		it('should still list the recordings with a room member token minted without joining', async () => {
			const response = await request(app)
				.get(RECORDINGS_PATH)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, waitingAdmitter.memberToken);
			expect(response.status).toBe(200);
		});

		it('should act on the meeting with the join token of an admitted participant, of a holder of lobbyBypass and of a moderator demoted during the meeting', async () => {
			for (const token of [admittedToken, hostToken, demotedToken]) {
				const responses = await Promise.all(meetingRequests(token));
				responses.forEach((response) => expect(response.status).toBe(200));
			}

			for (const token of [admittedToken, hostToken]) {
				expect((await startRecordingWith(token)).status).not.toBe(403);
			}

			expect((await getLobby(lobbyRoomId, admittedToken)).status).toBe(200);
		});

		it('should guard the waiting room operations with lobbyAdmin', async () => {
			expect((await getLobby(lobbyRoomId)).status).toBe(200);
			expectMeetError(await getLobby(lobbyRoomId, demotedToken), errorInsufficientPermissions());
			expectMeetError(
				await request(app)
					.get(`${MEETINGS_PATH}/${lobbyRoomId}/lobby`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, rootAdminAccessToken),
				errorUnauthorized()
			);
			expectMeetError(
				await getLobby(lobbyRoomId, (await setupSingleRoom()).moderatorToken),
				errorInsufficientPermissions()
			);
		});
	});
});
