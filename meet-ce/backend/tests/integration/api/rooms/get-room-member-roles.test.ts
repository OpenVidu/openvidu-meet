import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { MeetRoomMemberRole } from '@openvidu-meet/typings';
import {
	expectValidRoomMemberRoleAndPermissionsResponse,
	expectValidRoomMemberRolesAndPermissionsResponse
} from '../../../helpers/assertion-helpers.js';
import {
	deleteAllRooms,
	getRoomMemberRoleBySecret,
	getRoomMemberRoles,
	startTestServer
} from '../../../helpers/request-helpers.js';
import { RoomData, setupSingleRoom } from '../../../helpers/test-scenarios.js';

describe('Room API Tests', () => {
	let roomData: RoomData;

	beforeAll(async () => {
		await startTestServer();
		roomData = await setupSingleRoom();
	});

	afterAll(async () => {
		await deleteAllRooms();
	});

	describe('Get Room Member Roles Tests', () => {
		it('should retrieve all roles and associated permissions for a room', async () => {
			const response = await getRoomMemberRoles(roomData.room.roomId);
			expectValidRoomMemberRolesAndPermissionsResponse(response, roomData.room.roomId);
		});

		it('should return a 404 error if the room does not exist', async () => {
			const response = await getRoomMemberRoles('non-existent-room-id');
			expect(response.status).toBe(404);
		});
	});

	describe('Get Room Member Role Tests', () => {
		it('should retrieve moderator role and associated permissions for a room with a valid moderator secret', async () => {
			const response = await getRoomMemberRoleBySecret(roomData.room.roomId, roomData.moderatorSecret);
			expectValidRoomMemberRoleAndPermissionsResponse(
				response,
				roomData.room.roomId,
				MeetRoomMemberRole.MODERATOR
			);
		});

		it('should retrieve speaker role and associated permissions for a room with a valid speaker secret', async () => {
			const response = await getRoomMemberRoleBySecret(roomData.room.roomId, roomData.speakerSecret);
			expectValidRoomMemberRoleAndPermissionsResponse(response, roomData.room.roomId, MeetRoomMemberRole.SPEAKER);
		});

		it('should return a 404 error if the room does not exist', async () => {
			const response = await getRoomMemberRoleBySecret('non-existent-room-id', roomData.moderatorSecret);
			expect(response.status).toBe(404);
		});

		it('should return a 400 error if the secret is invalid', async () => {
			const response = await getRoomMemberRoleBySecret(roomData.room.roomId, 'invalid-secret');
			expect(response.status).toBe(400);
		});
	});
});
