import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { MeetRoomMember, MeetRoomMemberRole, MeetUserRole } from '@openvidu-meet/typings';
import { container } from '../../../../src/config/dependency-injector.config.js';
import { MEET_ENV } from '../../../../src/environment.js';
import { OpenViduMeetError } from '../../../../src/models/error.model.js';
import { RoomMemberRepository } from '../../../../src/repositories/room-member.repository.js';
import { LiveKitService } from '../../../../src/services/livekit.service.js';
import { TokenService } from '../../../../src/services/token.service.js';
import { expectValidationError } from '../../../helpers/assertion-helpers.js';
import {
	bulkDeleteRoomMembers,
	createRoom,
	createRoomMember,
	createUser,
	deleteAllRooms,
	deleteAllUsers,
	disconnectFakeParticipants,
	generateRoomMemberTokenRequest,
	getRoomMember,
	getUser,
	joinFakeParticipant,
	startTestServer,
	updateParticipantMetadata
} from '../../../helpers/request-helpers.js';

describe('Bulk Delete Room Members API Tests', () => {
	let roomId: string;

	beforeAll(async () => {
		await startTestServer();

		const room = await createRoom();
		roomId = room.roomId;
	});

	afterAll(async () => {
		await disconnectFakeParticipants();
		await deleteAllRooms();
		await deleteAllUsers();
	});

	describe('Bulk Delete Room Members Tests', () => {
		it('should successfully delete multiple external members', async () => {
			// Create multiple external members
			const member1 = await createRoomMember(roomId, {
				name: 'External Member 1',
				baseRole: MeetRoomMemberRole.MODERATOR
			});
			const member2 = await createRoomMember(roomId, {
				name: 'External Member 2',
				baseRole: MeetRoomMemberRole.SPEAKER
			});

			const memberIds = [member1.body.memberId, member2.body.memberId];

			// Delete all members
			const response = await bulkDeleteRoomMembers(roomId, memberIds);
			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty('message', 'All room members deleted successfully');
			expect(response.body).toHaveProperty('deleted');
			expect(response.body.deleted).toHaveLength(2);
			expect(response.body.deleted).toEqual(expect.arrayContaining(memberIds));

			// Verify all members no longer exist
			for (const memberId of memberIds) {
				const getResponse = await getRoomMember(roomId, memberId);
				expect(getResponse.status).toBe(404);
			}
		});

		it('should successfully delete multiple registered user members', async () => {
			// Create registered users
			const userId1 = `user1_${Date.now()}`;
			const userId2 = `user2_${Date.now()}`;
			await createUser({
				userId: userId1,
				name: 'User 1',
				password: 'password123',
				role: MeetUserRole.USER
			});
			await createUser({
				userId: userId2,
				name: 'User 2',
				password: 'password123',
				role: MeetUserRole.USER
			});

			// Add as room members
			const member1 = await createRoomMember(roomId, { userId: userId1, baseRole: MeetRoomMemberRole.SPEAKER });
			const member2 = await createRoomMember(roomId, { userId: userId2, baseRole: MeetRoomMemberRole.SPEAKER });

			const memberIds = [member1.body.memberId, member2.body.memberId];

			// Delete all members
			const response = await bulkDeleteRoomMembers(roomId, memberIds);
			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty('message', 'All room members deleted successfully');
			expect(response.body).toHaveProperty('deleted');
			expect(response.body.deleted).toHaveLength(2);
			expect(response.body.deleted).toEqual(expect.arrayContaining(memberIds));

			// Check that users still exist
			for (const userId of [userId1, userId2]) {
				const getUserResponse = await getUser(userId);
				expect(getUserResponse.status).toBe(200);
			}
		});

		it('should delete mix of registered and external members', async () => {
			// Create a registered user
			const userId = `user_${Date.now()}`;
			await createUser({ userId, name: 'Registered User', password: 'password123', role: MeetUserRole.USER });

			// Add as room member
			await createRoomMember(roomId, { userId, baseRole: MeetRoomMemberRole.SPEAKER });

			// Create external members
			const external = await createRoomMember(roomId, {
				name: 'External 1',
				baseRole: MeetRoomMemberRole.SPEAKER
			});

			const memberIds = [userId, external.body.memberId];

			// Delete all members
			const response = await bulkDeleteRoomMembers(roomId, memberIds);
			expect(response.status).toBe(200);
			expect(response.body.deleted).toHaveLength(2);
		});

		it('should successfully delete single member using bulk endpoint', async () => {
			// Create one member
			const member = await createRoomMember(roomId, {
				name: 'Single Member',
				baseRole: MeetRoomMemberRole.SPEAKER
			});

			const memberIds = [member.body.memberId];

			// Delete using bulk endpoint
			const response = await bulkDeleteRoomMembers(roomId, memberIds);
			expect(response.status).toBe(200);
			expect(response.body.deleted).toHaveLength(1);
			expect(response.body.deleted[0]).toBe(member.body.memberId);
		});

		it('should handle partial deletion when some members do not exist', async () => {
			// Create some members
			const member1 = await createRoomMember(roomId, {
				name: 'Existing Member 1',
				baseRole: MeetRoomMemberRole.SPEAKER
			});
			const member2 = await createRoomMember(roomId, {
				name: 'Existing Member 2',
				baseRole: MeetRoomMemberRole.SPEAKER
			});

			const existingIds = [member1.body.memberId, member2.body.memberId];
			const nonExistentIds = ['nonexistent_1', 'nonexistent_2'];
			const allIds = [...existingIds, ...nonExistentIds];

			// Try to delete all
			const response = await bulkDeleteRoomMembers(roomId, allIds);
			expect(response.status).toBe(400);
			expect(response.body).toHaveProperty('message');
			expect(response.body.message).toBe('2 room member(s) could not be deleted');
			expect(response.body).toHaveProperty('deleted');
			expect(response.body).toHaveProperty('failed');
			expect(response.body.deleted).toHaveLength(2);
			expect(response.body.failed).toHaveLength(2);

			// Verify failed members have error messages
			for (const failed of response.body.failed) {
				expect(failed).toHaveProperty('memberId');
				expect(failed).toHaveProperty('error', 'Room member not found');
			}
		});

		it('should kick participants from meeting when deleting members', async () => {
			// Create two members
			const member1Response = await createRoomMember(roomId, {
				name: 'Meeting Member 1',
				baseRole: MeetRoomMemberRole.SPEAKER
			});
			const member2Response = await createRoomMember(roomId, {
				name: 'Meeting Member 2',
				baseRole: MeetRoomMemberRole.MODERATOR
			});

			const member1 = member1Response.body as MeetRoomMember;
			const member2 = member2Response.body as MeetRoomMember;

			// Generate tokens and join meeting for both
			const token1Response = await generateRoomMemberTokenRequest(roomId, {
				secret: member1.memberId,
				joinMeeting: true,
				participantName: 'Meeting Member 1'
			});
			const token2Response = await generateRoomMemberTokenRequest(roomId, {
				secret: member2.memberId,
				joinMeeting: true,
				participantName: 'Meeting Member 2'
			});

			// Get participant identities from tokens
			const tokenService = container.get(TokenService);
			const decodedToken1 = await tokenService.verifyToken(token1Response.body.token);
			const decodedToken2 = await tokenService.verifyToken(token2Response.body.token);
			const participantIdentity1 = decodedToken1.sub!;
			const participantIdentity2 = decodedToken2.sub!;

			// Join fake participants and update metadata
			await joinFakeParticipant(roomId, participantIdentity1);
			await updateParticipantMetadata(roomId, participantIdentity1, {
				iat: Date.now(),
				livekitUrl: MEET_ENV.LIVEKIT_URL,
				roomId,
				memberId: member1.memberId,
				baseRole: MeetRoomMemberRole.SPEAKER,
				effectivePermissions: member1.effectivePermissions
			});

			await joinFakeParticipant(roomId, participantIdentity2);
			await updateParticipantMetadata(roomId, participantIdentity2, {
				iat: Date.now(),
				livekitUrl: MEET_ENV.LIVEKIT_URL,
				roomId,
				memberId: member2.memberId,
				baseRole: MeetRoomMemberRole.MODERATOR,
				effectivePermissions: member2.effectivePermissions
			});

			// Update room members currentParticipantIdentity
			const roomMemberRepository = container.get(RoomMemberRepository);
			member1.currentParticipantIdentity = participantIdentity1;
			member2.currentParticipantIdentity = participantIdentity2;
			await roomMemberRepository.update(member1);
			await roomMemberRepository.update(member2);

			// Verify both participants exist
			const livekitService = container.get(LiveKitService);
			const participant1 = await livekitService.getParticipant(roomId, participantIdentity1);
			const participant2 = await livekitService.getParticipant(roomId, participantIdentity2);
			expect(participant1).toBeDefined();
			expect(participant2).toBeDefined();

			// Delete both members
			const memberIds = [member1.memberId, member2.memberId];
			const response = await bulkDeleteRoomMembers(roomId, memberIds);
			expect(response.status).toBe(200);
			expect(response.body.deleted).toHaveLength(2);

			// Verify both participants were kicked from LiveKit
			await expect(livekitService.getParticipant(roomId, participantIdentity1)).rejects.toThrow(
				OpenViduMeetError
			);
			await expect(livekitService.getParticipant(roomId, participantIdentity2)).rejects.toThrow(
				OpenViduMeetError
			);
		});

		it('should fail when all members do not exist', async () => {
			const nonExistentIds = ['nonexistent_1', 'nonexistent_2', 'nonexistent_3'];

			const response = await bulkDeleteRoomMembers(roomId, nonExistentIds);
			expect(response.status).toBe(400);
			expect(response.body).toHaveProperty('message');
			expect(response.body.message).toBe('3 room member(s) could not be deleted');
			expect(response.body.deleted).toHaveLength(0);
			expect(response.body.failed).toHaveLength(3);
		});

		it('should fail when room does not exist', async () => {
			const response = await bulkDeleteRoomMembers('nonexistent_room_123', ['member1', 'member2']);
			expect(response.status).toBe(404);
			expect(response.body).toHaveProperty('message');
			expect(response.body.message).toContain('does not exist');
		});
	});

	describe('Bulk Delete Room Members Validation Tests', () => {
		it('should fail when memberIds is empty', async () => {
			const response = await bulkDeleteRoomMembers(roomId, []);
			expectValidationError(response, 'memberIds', 'At least one memberId is required');
		});
	});
});
