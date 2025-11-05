import { afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import {
	createRoom,
	deleteAllRooms,
	disconnectFakeParticipants,
	endMeeting,
	getRoom,
	startTestServer,
	updateRoomStatus
} from '../../../helpers/request-helpers.js';
import { setupSingleRoom } from '../../../helpers/test-scenarios.js';

describe('Room API Tests', () => {
	beforeAll(async () => {
		await startTestServer();
	});

	afterEach(async () => {
		await disconnectFakeParticipants();
		await deleteAllRooms();
	});

	describe('Update Room Status Tests', () => {
		it('should successfully update room status to open', async () => {
			const createdRoom = await createRoom({
				roomName: 'update-test'
			});

			// Update the room status
			const response = await updateRoomStatus(createdRoom.roomId, 'open');
			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty('message');

			// Verify with a get request
			const getResponse = await getRoom(createdRoom.roomId);
			expect(getResponse.status).toBe(200);
			expect(getResponse.body.status).toEqual('open');
		});

		it('should successfully update room status to closed', async () => {
			const createdRoom = await createRoom({
				roomName: 'update-test'
			});

			// Update the room status
			const response = await updateRoomStatus(createdRoom.roomId, 'closed');
			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty('message');

			// Verify with a get request
			const getResponse = await getRoom(createdRoom.roomId);
			expect(getResponse.status).toBe(200);
			expect(getResponse.body.status).toEqual('closed');
		});

		it('should schedule room to be closed when meeting ends if there is an active meeting', async () => {
			const roomData = await setupSingleRoom(true);

			// Update the room status
			const response = await updateRoomStatus(roomData.room.roomId, 'closed');
			expect(response.status).toBe(202);
			expect(response.body).toHaveProperty('message');

			// Verify with a get request
			let getResponse = await getRoom(roomData.room.roomId);
			expect(getResponse.status).toBe(200);
			expect(getResponse.body.status).toEqual('active_meeting');
			expect(getResponse.body.meetingEndAction).toEqual('close');

			// End meeting and verify closed status
			await endMeeting(roomData.room.roomId, roomData.moderatorToken);

			getResponse = await getRoom(roomData.room.roomId);
			expect(getResponse.status).toBe(200);
			expect(getResponse.body.status).toEqual('closed');
			expect(getResponse.body.meetingEndAction).toEqual('none');
		});

		it('should fail with 404 when updating non-existent room', async () => {
			const nonExistentRoomId = 'non-existent-room';

			const response = await updateRoomStatus(nonExistentRoomId, 'closed');

			expect(response.status).toBe(404);
			expect(response.body.message).toContain(`'${nonExistentRoomId}' does not exist`);
		});
	});

	describe('Update Room Status Validation failures', () => {
		it('should fail when status is invalid', async () => {
			const { roomId } = await createRoom({
				roomName: 'validation-test'
			});

			// Invalid status
			const response = await updateRoomStatus(roomId, 'invalid_status');

			expect(response.status).toBe(422);
			expect(response.body.error).toContain('Unprocessable Entity');
			expect(JSON.stringify(response.body.details)).toContain('Invalid enum value');
		});
	});
});
