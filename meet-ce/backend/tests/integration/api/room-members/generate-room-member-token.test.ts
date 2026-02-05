import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import {
	MeetRoomMember,
	MeetRoomMemberPermissions,
	MeetRoomMemberRole,
	MeetRoomRoles,
	MeetRoomStatus,
	MeetUserRole
} from '@openvidu-meet/typings';
import { expectValidationError, expectValidRoomMemberTokenResponse } from '../../../helpers/assertion-helpers.js';
import {
	createRoom,
	createRoomMember,
	deleteAllRooms,
	deleteAllUsers,
	disconnectFakeParticipants,
	endMeeting,
	generateRoomMemberToken,
	generateRoomMemberTokenRequest,
	startTestServer,
	updateRoomAnonymousConfig,
	updateRoomRoles,
	updateRoomStatus
} from '../../../helpers/request-helpers.js';
import { setupSingleRoom, setupUser } from '../../../helpers/test-scenarios.js';
import { RoomData } from '../../../interfaces/scenarios.js';

const allPermissions: MeetRoomMemberPermissions = {
	canRecord: true,
	canRetrieveRecordings: true,
	canDeleteRecordings: true,
	canJoinMeeting: true,
	canShareAccessLinks: true,
	canMakeModerator: true,
	canKickParticipants: true,
	canEndMeeting: true,
	canPublishVideo: true,
	canPublishAudio: true,
	canShareScreen: true,
	canReadChat: true,
	canWriteChat: true,
	canChangeVirtualBackground: true
};

describe('Room Members API Tests', () => {
	let roomData: RoomData;
	let roomId: string;
	let roomRoles: MeetRoomRoles;

	beforeAll(async () => {
		await startTestServer();
		roomData = await setupSingleRoom();
		roomId = roomData.room.roomId;
		roomRoles = roomData.room.roles;
	});

	afterAll(async () => {
		await disconnectFakeParticipants();
		await deleteAllRooms();
		await deleteAllUsers();
	});

	describe('Generate Room Member Token Tests', () => {
		it('should generate anonymous moderator token when anonymous.moderator.enabled is true', async () => {
			// Enable anonymous moderator access
			await updateRoomAnonymousConfig(roomId, {
				moderator: { enabled: true }
			});

			const response = await generateRoomMemberTokenRequest(roomId, { secret: roomData.moderatorSecret });
			expectValidRoomMemberTokenResponse(response, {
				roomId,
				baseRole: MeetRoomMemberRole.MODERATOR,
				effectivePermissions: roomRoles.moderator.permissions
			});
		});

		it('should fail to generate anonymous moderator token when anonymous.moderator.enabled is false', async () => {
			// Disable anonymous moderator access
			await updateRoomAnonymousConfig(roomId, {
				moderator: { enabled: false }
			});

			const response = await generateRoomMemberTokenRequest(roomId, { secret: roomData.moderatorSecret });
			expect(response.status).toBe(403);

			// Enable anonymous moderator access for further tests
			await updateRoomAnonymousConfig(roomId, {
				moderator: { enabled: true }
			});
		});

		it('should generate anonymous speaker token when anonymous.speaker.enabled is true', async () => {
			// Enable anonymous speaker access
			await updateRoomAnonymousConfig(roomId, {
				speaker: { enabled: true }
			});

			const response = await generateRoomMemberTokenRequest(roomId, { secret: roomData.speakerSecret });
			expectValidRoomMemberTokenResponse(response, {
				roomId,
				baseRole: MeetRoomMemberRole.SPEAKER,
				effectivePermissions: roomRoles.speaker.permissions
			});
		});

		it('should fail to generate anonymous speaker token when anonymous.speaker.enabled is false', async () => {
			// Disable anonymous speaker access
			await updateRoomAnonymousConfig(roomId, {
				speaker: { enabled: false }
			});

			const response = await generateRoomMemberTokenRequest(roomId, { secret: roomData.speakerSecret });
			expect(response.status).toBe(403);

			// Enable anonymous speaker access for further tests
			await updateRoomAnonymousConfig(roomId, {
				speaker: { enabled: true }
			});
		});

		it('should fail to generate token when secret is invalid', async () => {
			const response = await generateRoomMemberTokenRequest(roomId, {
				secret: 'invalid-secret'
			});
			expect(response.status).toBe(400);
		});

		it('should generate token for registered ADMIN user', async () => {
			// Create a registered ADMIN user
			const adminData = await setupUser({
				userId: `admin_${Date.now()}`,
				name: 'Admin User',
				password: 'adminpassword',
				role: MeetUserRole.ADMIN
			});

			// Generate token without specifying secret (should use ADMIN privileges)
			const response = await generateRoomMemberTokenRequest(roomId, {}, adminData.accessToken);
			expectValidRoomMemberTokenResponse(response, {
				roomId,
				baseRole: MeetRoomMemberRole.MODERATOR, // ADMIN users should get MODERATOR role in the room
				effectivePermissions: allPermissions // ADMIN users should have all permissions
			});
		});

		it('should generate token for room owner', async () => {
			// Create a registered user to be the room owner
			const ownerData = await setupUser({
				userId: `owner_${Date.now()}`,
				name: 'Room Owner',
				password: 'ownerpassword',
				role: MeetUserRole.USER
			});

			// Create room with the user as owner
			const roomWithOwner = await createRoom({}, ownerData.accessToken);

			// Generate token for the room owner
			const response = await generateRoomMemberTokenRequest(roomWithOwner.roomId, {}, ownerData.accessToken);
			expectValidRoomMemberTokenResponse(response, {
				roomId: roomWithOwner.roomId,
				baseRole: MeetRoomMemberRole.MODERATOR, // Room owner should get MODERATOR role
				effectivePermissions: allPermissions // Room owner should have all permissions
			});
		});

		it('should generate token for registered user room member', async () => {
			// Create a registered user
			const userData = await setupUser({
				userId: `user_${Date.now()}`,
				name: 'Registered Member',
				password: 'password123',
				role: MeetUserRole.USER
			});

			// Add as room member
			await createRoomMember(roomId, {
				userId: userData.user.userId,
				baseRole: MeetRoomMemberRole.MODERATOR
			});

			// Generate token without specifying secret
			const response = await generateRoomMemberTokenRequest(roomId, {}, userData.accessToken);
			expectValidRoomMemberTokenResponse(response, {
				roomId,
				memberId: userData.user.userId,
				baseRole: MeetRoomMemberRole.MODERATOR,
				effectivePermissions: roomRoles.moderator.permissions
			});
		});

		it('should generate token for external room member', async () => {
			// Create external room member
			const createResponse = await createRoomMember(roomId, {
				name: 'External Member',
				baseRole: MeetRoomMemberRole.SPEAKER
			});
			const memberId = createResponse.body.memberId;

			// Generate token using external memberId as secret
			const response = await generateRoomMemberTokenRequest(roomId, {
				secret: memberId
			});
			expectValidRoomMemberTokenResponse(response, {
				roomId,
				memberId,
				baseRole: MeetRoomMemberRole.SPEAKER,
				effectivePermissions: roomRoles.speaker.permissions
			});
		});

		it('should generate token with custom permissions for room member', async () => {
			// Create room member with custom permissions
			const createResponse = await createRoomMember(roomId, {
				name: 'Custom Permissions Member',
				baseRole: MeetRoomMemberRole.SPEAKER,
				customPermissions: {
					canRecord: true,
					canDeleteRecordings: true,
					canKickParticipants: true
				}
			});
			const memberId = createResponse.body.memberId;
			const effectivePermissions = createResponse.body.effectivePermissions;

			const response = await generateRoomMemberTokenRequest(roomId, {
				secret: memberId
			});
			expectValidRoomMemberTokenResponse(response, {
				roomId,
				memberId,
				baseRole: MeetRoomMemberRole.SPEAKER,
				customPermissions: {
					canRecord: true,
					canDeleteRecordings: true,
					canKickParticipants: true
				},
				effectivePermissions
			});
		});

		it('should fail to generate token when room does not exist', async () => {
			const response = await generateRoomMemberTokenRequest('non-existent-room-id', {
				secret: roomData.moderatorSecret
			});
			expect(response.status).toBe(404);
		});

		it('should generate normal token when not specifying joinMeeting', async () => {
			const response = await generateRoomMemberTokenRequest(roomId, {
				secret: roomData.moderatorSecret
			});
			expectValidRoomMemberTokenResponse(response, {
				roomId,
				baseRole: MeetRoomMemberRole.MODERATOR,
				effectivePermissions: roomRoles.moderator.permissions,
				joinMeeting: false
			});
		});

		it('should generate token for joining meeting when specifying joinMeeting true and participantName', async () => {
			const participantName = 'Alice Smith';
			const response = await generateRoomMemberTokenRequest(roomId, {
				secret: roomData.moderatorSecret,
				joinMeeting: true,
				participantName
			});
			expectValidRoomMemberTokenResponse(response, {
				roomId,
				baseRole: MeetRoomMemberRole.MODERATOR,
				effectivePermissions: roomRoles.moderator.permissions,
				joinMeeting: true,
				participantName,
				participantIdentityPrefix: 'alice_smith'
			});

			// End the meeting for further tests
			// Note: We need to generate a new moderator token since some tests modify the room roles or anonymous config,
			// which invalidate the previous moderator token.
			const moderatorToken = await generateRoomMemberToken(roomId, {
				secret: roomData.moderatorSecret
			});
			await endMeeting(roomId, moderatorToken);
		});

		it('should generate token when specifying joinMeeting true and participant already exists in the room', async () => {
			const participantName = 'Alice Smith';

			// Create token for the first participant
			let response = await generateRoomMemberTokenRequest(roomId, {
				secret: roomData.moderatorSecret,
				joinMeeting: true,
				participantName
			});
			expectValidRoomMemberTokenResponse(response, {
				roomId,
				baseRole: MeetRoomMemberRole.MODERATOR,
				effectivePermissions: roomRoles.moderator.permissions,
				joinMeeting: true,
				participantName,
				participantIdentityPrefix: 'alice_smith'
			});

			// Create token for the second participant with the same name
			response = await generateRoomMemberTokenRequest(roomId, {
				secret: roomData.moderatorSecret,
				joinMeeting: true,
				participantName
			});
			expectValidRoomMemberTokenResponse(response, {
				roomId,
				baseRole: MeetRoomMemberRole.MODERATOR,
				effectivePermissions: roomRoles.moderator.permissions,
				joinMeeting: true,
				participantName: participantName + '_1', // Suffix is added to avoid conflict with the first participant
				participantIdentityPrefix: 'alice_smith_1'
			});

			// End the meeting for further tests
			// Note: We need to generate a new moderator token since some tests modify the room roles or anonymous config,
			// which invalidate the previous moderator token.
			const moderatorToken = await generateRoomMemberToken(roomId, {
				secret: roomData.moderatorSecret
			});
			await endMeeting(roomId, moderatorToken);
		});

		it('should fail to generate token when anonymous user tries to join meeting without canJoinMeeting permission', async () => {
			// Disable canJoinMeeting permission for anonymous speakers
			await updateRoomRoles(roomId, {
				speaker: {
					permissions: {
						canJoinMeeting: false
					}
				}
			});

			const response = await generateRoomMemberTokenRequest(roomId, {
				secret: roomData.speakerSecret,
				joinMeeting: true,
				participantName: 'Anonymous User'
			});
			expect(response.status).toBe(403);

			// Restore default config
			await updateRoomRoles(roomId, {
				speaker: {
					permissions: {
						canJoinMeeting: true
					}
				}
			});
		});

		it('should fail to generate token when room member does not have canJoinMeeting permission', async () => {
			// Create room member without canJoinMeeting permission
			const createResponse = await createRoomMember(roomId, {
				name: 'No Join Member',
				baseRole: MeetRoomMemberRole.SPEAKER,
				customPermissions: {
					canJoinMeeting: false
				}
			});
			const member = createResponse.body as MeetRoomMember;

			// Try to generate token to join meeting
			const response = await generateRoomMemberTokenRequest(roomId, {
				secret: member.memberId,
				joinMeeting: true,
				participantName: member.name
			});
			expect(response.status).toBe(403);
		});

		it('should fail to generate token for joining meeting when room is closed', async () => {
			// Close the room
			await updateRoomStatus(roomId, MeetRoomStatus.CLOSED);

			const response = await generateRoomMemberTokenRequest(roomId, {
				secret: roomData.moderatorSecret,
				joinMeeting: true,
				participantName: 'Alice Smith'
			});
			expect(response.status).toBe(409);

			// Reopen the room for further tests
			await updateRoomStatus(roomId, MeetRoomStatus.OPEN);
		});

		it('should refresh token to join meeting for an existing participant', async () => {
			const participantName = 'TEST_PARTICIPANT';

			// Create room with initial participant
			const roomWithParticipant = await setupSingleRoom(true);

			// Refresh token for the participant by specifying participantIdentity
			const response = await generateRoomMemberTokenRequest(roomWithParticipant.room.roomId, {
				secret: roomWithParticipant.moderatorSecret,
				joinMeeting: true,
				participantName,
				participantIdentity: participantName
			});
			expectValidRoomMemberTokenResponse(response, {
				roomId: roomWithParticipant.room.roomId,
				baseRole: MeetRoomMemberRole.MODERATOR,
				effectivePermissions: roomWithParticipant.room.roles.moderator.permissions,
				joinMeeting: true,
				participantName,
				participantIdentityPrefix: participantName
			});
		});

		it('should fail to refresh token when participant does not exist in the meeting', async () => {
			const participantName = 'Inexistent Participant';
			const response = await generateRoomMemberTokenRequest(roomId, {
				secret: roomData.moderatorSecret,
				joinMeeting: true,
				participantName,
				participantIdentity: participantName
			});
			expect(response.status).toBe(404);
		});

		it('should handle special characters in participant name', async () => {
			const participantName = "José María O'Brien-García";
			const response = await generateRoomMemberTokenRequest(roomId, {
				secret: roomData.moderatorSecret,
				joinMeeting: true,
				participantName
			});
			expectValidRoomMemberTokenResponse(response, {
				roomId,
				baseRole: MeetRoomMemberRole.MODERATOR,
				effectivePermissions: roomRoles.moderator.permissions,
				joinMeeting: true,
				participantName,
				participantIdentityPrefix: 'jose_maria_obrien_garcia'
			});

			// End the meeting for further tests
			// Note: We need to generate a new moderator token since some tests modify the room roles or anonymous config,
			// which invalidate the previous moderator token.
			const moderatorToken = await generateRoomMemberToken(roomId, {
				secret: roomData.moderatorSecret
			});
			await endMeeting(roomId, moderatorToken);
		});

		it('should use default participant identity prefix when participant name has no valid characters', async () => {
			const participantName = '!!!@@@###';
			const response = await generateRoomMemberTokenRequest(roomId, {
				secret: roomData.moderatorSecret,
				joinMeeting: true,
				participantName
			});
			expectValidRoomMemberTokenResponse(response, {
				roomId,
				baseRole: MeetRoomMemberRole.MODERATOR,
				effectivePermissions: roomRoles.moderator.permissions,
				joinMeeting: true,
				participantName,
				participantIdentityPrefix: 'participant'
			});

			// End the meeting for further tests
			// Note: We need to generate a new moderator token since some tests modify the room roles or anonymous config,
			// which invalidate the previous moderator token.
			const moderatorToken = await generateRoomMemberToken(roomId, {
				secret: roomData.moderatorSecret
			});
			await endMeeting(roomId, moderatorToken);
		});
	});

	describe('Generate Room Member Token Validation Tests', () => {
		it('should fail when joinMeeting is not a boolean', async () => {
			const response = await generateRoomMemberTokenRequest(roomData.room.roomId, {
				joinMeeting: 'not-a-boolean' as unknown as boolean
			});
			expectValidationError(response, 'joinMeeting', 'Expected boolean');
		});

		it('should fail when joinMeeting is true but participantName is not provided', async () => {
			const response = await generateRoomMemberTokenRequest(roomData.room.roomId, {
				joinMeeting: true
			});
			expectValidationError(response, 'participantName', 'participantName is required when joinMeeting is true');
		});
	});
});
