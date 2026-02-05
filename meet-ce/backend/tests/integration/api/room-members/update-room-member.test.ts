import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { MeetRoomMember, MeetRoomMemberRole, MeetRoomRoles, MeetUserRole } from '@openvidu-meet/typings';
import { container } from '../../../../src/config/dependency-injector.config.js';
import { MEET_ENV } from '../../../../src/environment.js';
import { OpenViduMeetError } from '../../../../src/models/error.model.js';
import { RoomMemberRepository } from '../../../../src/repositories/room-member.repository.js';
import { LiveKitService } from '../../../../src/services/livekit.service.js';
import { TokenService } from '../../../../src/services/token.service.js';
import { expectValidationError } from '../../../helpers/assertion-helpers.js';
import {
	createRoom,
	createRoomMember,
	createUser,
	deleteAllRooms,
	deleteAllUsers,
	disconnectFakeParticipants,
	generateRoomMemberTokenRequest,
	getRoomMember,
	joinFakeParticipant,
	sleep,
	startTestServer,
	updateParticipantMetadata,
	updateRoomMember
} from '../../../helpers/request-helpers.js';

describe('Room Members API Tests', () => {
	let roomId: string;
	let roomRoles: MeetRoomRoles;

	beforeAll(async () => {
		await startTestServer();

		const room = await createRoom();
		roomId = room.roomId;
		roomRoles = room.roles;
	});

	afterAll(async () => {
		await disconnectFakeParticipants();
		await deleteAllRooms();
		await deleteAllUsers();
	});

	describe('Update Room Member Tests', () => {
		it('should successfully update baseRole from SPEAKER to MODERATOR', async () => {
			// Create a member with SPEAKER role
			const createResponse = await createRoomMember(roomId, {
				name: 'Test Member',
				baseRole: MeetRoomMemberRole.SPEAKER
			});
			const memberId = createResponse.body.memberId;

			// Update to MODERATOR
			const response = await updateRoomMember(roomId, memberId, {
				baseRole: MeetRoomMemberRole.MODERATOR
			});
			expect(response.status).toBe(200);

			expect(response.body).toHaveProperty('baseRole', MeetRoomMemberRole.MODERATOR);
			expect(response.body.effectivePermissions).toEqual(roomRoles.moderator.permissions);
		});

		it('should successfully update baseRole from MODERATOR to SPEAKER', async () => {
			// Create a member with MODERATOR role
			const createResponse = await createRoomMember(roomId, {
				name: 'Test Member',
				baseRole: MeetRoomMemberRole.MODERATOR
			});
			const memberId = createResponse.body.memberId;

			// Update to SPEAKER
			const response = await updateRoomMember(roomId, memberId, {
				baseRole: MeetRoomMemberRole.SPEAKER
			});
			expect(response.status).toBe(200);

			expect(response.body).toHaveProperty('baseRole', MeetRoomMemberRole.SPEAKER);
			expect(response.body.effectivePermissions).toEqual(roomRoles.speaker.permissions);
		});

		it('should successfully update customPermissions', async () => {
			// Create a member without custom permissions
			const createResponse = await createRoomMember(roomId, {
				name: 'Test Member',
				baseRole: MeetRoomMemberRole.SPEAKER
			});
			const memberId = createResponse.body.memberId;

			// Add custom permissions
			const response = await updateRoomMember(roomId, memberId, {
				customPermissions: {
					canRecord: true,
					canDeleteRecordings: true,
					canKickParticipants: true
				}
			});
			expect(response.status).toBe(200);

			expect(response.body).toHaveProperty('customPermissions');
			expect(response.body.customPermissions).toHaveProperty('canRecord', true);
			expect(response.body.customPermissions).toHaveProperty('canDeleteRecordings', true);
			expect(response.body.customPermissions).toHaveProperty('canKickParticipants', true);
			expect(response.body.effectivePermissions).toHaveProperty('canRecord', true);
			expect(response.body.effectivePermissions).toHaveProperty('canDeleteRecordings', true);
			expect(response.body.effectivePermissions).toHaveProperty('canKickParticipants', true);
		});

		it('should successfully update both baseRole and customPermissions', async () => {
			// Create a member
			const createResponse = await createRoomMember(roomId, {
				name: 'Test Member',
				baseRole: MeetRoomMemberRole.SPEAKER
			});
			const memberId = createResponse.body.memberId;

			// Update both
			const response = await updateRoomMember(roomId, memberId, {
				baseRole: MeetRoomMemberRole.MODERATOR,
				customPermissions: {
					canRecord: false // Override a permission
				}
			});
			expect(response.status).toBe(200);

			expect(response.body).toHaveProperty('baseRole', MeetRoomMemberRole.MODERATOR);
			expect(response.body.customPermissions).toHaveProperty('canRecord', false);
			expect(response.body.effectivePermissions).toHaveProperty('canRecord', false);
		});

		it('should override existing customPermissions with new ones', async () => {
			// Create a member with custom permissions
			const createResponse = await createRoomMember(roomId, {
				name: 'Test Member',
				baseRole: MeetRoomMemberRole.SPEAKER,
				customPermissions: {
					canRecord: true,
					canDeleteRecordings: true
				}
			});
			const memberId = createResponse.body.memberId;

			// Update with different custom permissions
			const response = await updateRoomMember(roomId, memberId, {
				customPermissions: {
					canKickParticipants: true,
					canEndMeeting: true
				}
			});
			expect(response.status).toBe(200);

			expect(response.body.customPermissions).toHaveProperty('canKickParticipants', true);
			expect(response.body.customPermissions).toHaveProperty('canEndMeeting', true);
		});

		it('should verify member update is persisted', async () => {
			// Create a member
			const createResponse = await createRoomMember(roomId, {
				name: 'Test Member',
				baseRole: MeetRoomMemberRole.SPEAKER
			});
			const memberId = createResponse.body.memberId;

			// Update member
			const updateResponse = await updateRoomMember(roomId, memberId, {
				baseRole: MeetRoomMemberRole.MODERATOR
			});
			expect(updateResponse.status).toBe(200);

			// Verify persistence
			const getResponse = await getRoomMember(roomId, memberId);
			expect(getResponse.status).toBe(200);
			expect(getResponse.body).toHaveProperty('baseRole', MeetRoomMemberRole.MODERATOR);
			expect(getResponse.body.effectivePermissions).toEqual(roomRoles.moderator.permissions);
		});

		it('should update permissionsUpdatedAt timestamp', async () => {
			// Create a member
			const createResponse = await createRoomMember(roomId, {
				name: 'Test Member',
				baseRole: MeetRoomMemberRole.SPEAKER
			});
			const memberId = createResponse.body.memberId;
			const originalTimestamp = createResponse.body.permissionsUpdatedAt;

			// Wait a bit to ensure timestamp difference
			await sleep('1s');

			// Update member
			const updateResponse = await updateRoomMember(roomId, memberId, {
				baseRole: MeetRoomMemberRole.MODERATOR
			});
			expect(updateResponse.status).toBe(200);
			expect(updateResponse.body.permissionsUpdatedAt).toBeGreaterThan(originalTimestamp);
		});

		it('should successfully update registered user room member', async () => {
			// Create a registered user
			const userId = `user_${Date.now()}`;
			await createUser({
				userId,
				name: 'Registered Member',
				password: 'password123',
				role: MeetUserRole.USER
			});

			// Add as room member
			const createResponse = await createRoomMember(roomId, {
				userId,
				baseRole: MeetRoomMemberRole.SPEAKER
			});
			const memberId = createResponse.body.memberId;

			// Update member
			const response = await updateRoomMember(roomId, memberId, {
				baseRole: MeetRoomMemberRole.MODERATOR
			});
			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty('memberId', userId);
			expect(response.body).toHaveProperty('baseRole', MeetRoomMemberRole.MODERATOR);
		});

		it('should allow empty update body (no changes)', async () => {
			// Create a member
			const createResponse = await createRoomMember(roomId, {
				name: 'Test Member',
				baseRole: MeetRoomMemberRole.SPEAKER
			});
			const memberId = createResponse.body.memberId;

			// Update with empty body
			const response = await updateRoomMember(roomId, memberId, {});
			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty('baseRole', MeetRoomMemberRole.SPEAKER);
		});

		it('should fail when member does not exist', async () => {
			const response = await updateRoomMember(roomId, 'nonexistent_member_123', {
				baseRole: MeetRoomMemberRole.MODERATOR
			});
			expect(response.status).toBe(404);
			expect(response.body).toHaveProperty('message');
			expect(response.body.message).toContain('not found');
		});

		it('should fail when room does not exist', async () => {
			const response = await updateRoomMember('nonexistent_room_123', 'some_member_id', {
				baseRole: MeetRoomMemberRole.MODERATOR
			});
			expect(response.status).toBe(404);
			expect(response.body).toHaveProperty('message');
			expect(response.body.message).toContain('does not exist');
		});

		it('should kick participant from meeting when joinMeeting permission is removed', async () => {
			// Create a member
			const createResponse = await createRoomMember(roomId, {
				name: 'Test Member',
				baseRole: MeetRoomMemberRole.SPEAKER
			});
			const member = createResponse.body as MeetRoomMember;
			const memberId = member.memberId;

			// Generate room member token for joining meeting
			const tokenResponse = await generateRoomMemberTokenRequest(roomId, {
				secret: memberId,
				joinMeeting: true,
				participantName: 'Test Member'
			});
			const roomMemberToken = tokenResponse.body.token;

			// Get participant identity from token
			const tokenService = container.get(TokenService);
			const decodedToken = await tokenService.verifyToken(roomMemberToken);
			const participantIdentity = decodedToken.sub!;

			// Join fake participant to the room and update metadata to simulate real join
			await joinFakeParticipant(roomId, participantIdentity);
			await updateParticipantMetadata(roomId, participantIdentity, {
				iat: Date.now(),
				livekitUrl: MEET_ENV.LIVEKIT_URL,
				roomId,
				memberId,
				baseRole: MeetRoomMemberRole.SPEAKER,
				effectivePermissions: roomRoles.speaker.permissions
			});

			// Update room member currentParticipantIdentity manually to simulate real join
			const roomMemberRepository = container.get(RoomMemberRepository);
			member.currentParticipantIdentity = participantIdentity;
			await roomMemberRepository.update(member);

			// Verify participant exists before deletion
			const livekitService = container.get(LiveKitService);
			const participant = await livekitService.getParticipant(roomId, participantIdentity);
			expect(participant).toBeDefined();
			expect(participant.identity).toBe(participantIdentity);

			// Update room member to remove canJoinMeeting permission
			const response = await updateRoomMember(roomId, memberId, {
				customPermissions: {
					canJoinMeeting: false
				}
			});
			expect(response.status).toBe(200);
			expect(response.body.effectivePermissions.canJoinMeeting).toBe(false);

			// Check if the participant has been removed from LiveKit
			await expect(livekitService.getParticipant(roomId, participantIdentity)).rejects.toThrow(OpenViduMeetError);
		});
	});

	describe('Update Room Member Validation Tests', () => {
		let memberId: string;

		beforeAll(async () => {
			// Create a member
			const createResponse = await createRoomMember(roomId, {
				name: 'Test Member',
				baseRole: MeetRoomMemberRole.SPEAKER
			});
			memberId = createResponse.body.memberId;
		});

		it('should fail when baseRole is invalid', async () => {
			const response = await updateRoomMember(roomId, memberId, {
				baseRole: 'invalid' as MeetRoomMemberRole
			});
			expectValidationError(response, 'baseRole', 'Invalid enum value');
		});

		it('should fail when customPermissions has invalid boolean values', async () => {
			const response = await updateRoomMember(roomId, memberId, {
				customPermissions: {
					canRecord: 'not_a_boolean' as unknown as boolean
				}
			});
			expectValidationError(response, 'customPermissions.canRecord', 'Expected boolean');
		});
	});
});
