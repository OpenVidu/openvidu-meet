import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { ParticipantRole } from '../../../../src/typings/ce/index.js';
import {
	expectValidRoomRoleAndPermissionsResponse,
	expectValidRoomRolesAndPermissionsResponse
} from '../../../helpers/assertion-helpers.js';
import {
	deleteAllRooms,
	getRoomRoleBySecret,
	getRoomRoles,
	startTestServer
} from '../../../helpers/request-helpers.js';
import { RoomData, setupSingleRoom } from '../../../helpers/test-scenarios.js';

describe('Room API Tests', () => {
	let roomData: RoomData;

	beforeAll(async () => {
		startTestServer();
		roomData = await setupSingleRoom();
	});

	afterAll(async () => {
		await deleteAllRooms();
	});

	describe('Get Room Roles Tests', () => {
		it('should retrieve all roles and associated permissions for a room', async () => {
			const response = await getRoomRoles(roomData.room.roomId);
			expectValidRoomRolesAndPermissionsResponse(response, roomData.room.roomId);
		});

		it('should return a 404 error if the room does not exist', async () => {
			const response = await getRoomRoles('non-existent-room-id');
			expect(response.status).toBe(404);
		});
	});

	describe('Get Room Role Tests', () => {
		it('should retrieve moderator role and associated permissions for a room with a valid moderator secret', async () => {
			const response = await getRoomRoleBySecret(roomData.room.roomId, roomData.moderatorSecret);
			expectValidRoomRoleAndPermissionsResponse(response, roomData.room.roomId, ParticipantRole.MODERATOR);
		});

		it('should retrieve publisher role and associated permissions for a room with a valid publisher secret', async () => {
			const response = await getRoomRoleBySecret(roomData.room.roomId, roomData.publisherSecret);
			expectValidRoomRoleAndPermissionsResponse(response, roomData.room.roomId, ParticipantRole.PUBLISHER);
		});

		it('should return a 404 error if the room does not exist', async () => {
			const response = await getRoomRoleBySecret('non-existent-room-id', roomData.moderatorSecret);
			expect(response.status).toBe(404);
		});

		it('should return a 400 error if the secret is invalid', async () => {
			const response = await getRoomRoleBySecret(roomData.room.roomId, 'invalid-secret');
			expect(response.status).toBe(400);
		});
	});
});
