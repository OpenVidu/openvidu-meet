import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import {
	MeetAssistantCapabilityName,
	MeetParticipantModerationAction,
	MeetRoomMemberRole,
	MeetRoomMemberTokenMetadata,
	MeetRoomMemberUIBadge
} from '@openvidu-meet/typings';
import { Express } from 'express';
import request from 'supertest';
import { INTERNAL_CONFIG } from '../../../../src/config/internal-config.js';
import { MEET_ENV } from '../../../../src/environment.js';
import {
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
import { describeInCompatibilityMode } from '../../../helpers/meet-mode-helpers.js';
import {
	createAssistant,
	deleteAllRooms,
	generateRoomMemberToken,
	getFullPath,
	loginRootAdmin,
	startTestServer
} from '../../../helpers/request-helpers.js';

import { setupRoomMember, setupSingleRoom, updateRoomMemberPermissions } from '../../../helpers/test-scenarios.js';
import { RoomData, RoomMemberData } from '../../../interfaces/scenarios.js';

const MEETINGS_PATH = getFullPath(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/meetings`);
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
	});

	// The member's base role is MODERATOR, which grants all three gates, so only the denial carries
	// signal: an ignored deprecated key would leave the moderator default in place and the request
	// would succeed. Every request here is rejected before its controller, so the meeting and its
	// participant are left untouched.
	describeInCompatibilityMode('Deprecated permission spellings', () => {
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
});
