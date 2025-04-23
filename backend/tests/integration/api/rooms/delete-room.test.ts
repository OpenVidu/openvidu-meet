import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import {
	createRoom,
	deleteAllRooms,
	startTestServer,
	stopTestServer,
	getRoom,
	deleteRoom,
	joinFakeParticipant,
	sleep,
	disconnectFakeParticipants
} from '../../../utils/helpers.js';
import ms from 'ms';

describe('Room API Tests', () => {
	beforeAll(async () => {
		await startTestServer();
	});

	afterAll(async () => {
		await stopTestServer();
	});

	afterEach(async () => {
		// Remove all rooms created
		disconnectFakeParticipants();
		await deleteAllRooms();
	});

	describe('Delete Room Tests', () => {
		it('should return 204 when room does not exist (idempotent deletion)', async () => {
			const response = await deleteRoom('non-existent-room-id');

			expect(response.status).toBe(204);
		});

		it('should default to force=false when force parameter is invalid', async () => {
			// Create a room first
			const { roomId } = await createRoom({
				roomIdPrefix: 'test-room'
			});
			const response = await deleteRoom(roomId, { force: 'not-a-boolean' });

			expect(response.status).toBe(204);
			// Verify it's deleted
			const getResponse = await getRoom(roomId);
			expect(getResponse.status).toBe(404);
		});

		it('should mark room for deletion when participants exist and force parameter is invalid', async () => {
			// Create a room first
			const { roomId } = await createRoom({
				roomIdPrefix: 'test-room'
			});

			await joinFakeParticipant(roomId, 'test-participant');

			// The force parameter is not a boolean so it should be defined as false
			// and the room should be marked for deletion
			const response = await deleteRoom(roomId, { force: 'not-a-boolean' });

			// Check operation accepted
			expect(response.status).toBe(202);

			// The room should be marked for deletion
			const roomResponse = await getRoom(roomId);
			expect(roomResponse.body).toBeDefined();
			expect(roomResponse.body.roomId).toBe(roomId);
			expect(roomResponse.body.markedForDeletion).toBeDefined();
			expect(roomResponse.body.markedForDeletion).toBe(true);
		});

		it('should delete an empty room completely (204)', async () => {
			const { roomId } = await createRoom({ roomIdPrefix: 'test-room' });

			const response = await deleteRoom(roomId);

			expect(response.status).toBe(204);

			// Try to retrieve the room again
			const responseAfterDelete = await getRoom(roomId);
			expect(responseAfterDelete.status).toBe(404);
		});

		it('should sanitize roomId with spaces and special characters before deletion', async () => {
			// Create a room first
			const createdRoom = await createRoom({
				roomIdPrefix: 'test-mixed'
			});

			// Add some spaces and special chars to the valid roomId
			const modifiedId = ` ${createdRoom.roomId}!@# `;
			const response = await deleteRoom(modifiedId);

			// The validation should sanitize the ID and successfully delete
			expect(response.status).toBe(204);

			// Verify it's deleted
			const getResponse = await getRoom(createdRoom.roomId);
			expect(getResponse.status).toBe(404);
		});

		it('should handle explicit force=true for room with no participants', async () => {
			const createdRoom = await createRoom({
				roomIdPrefix: 'test-room'
			});

			const response = await deleteRoom(createdRoom.roomId, { force: true });

			expect(response.status).toBe(204);

			// Try to retrieve the room again
			const responseAfterDelete = await getRoom(createdRoom.roomId);
			expect(responseAfterDelete.status).toBe(404);
		});

		it('should mark room for deletion (202) when participants exist and force=false', async () => {
			const { roomId } = await createRoom({
				roomIdPrefix: 'test-room',
				autoDeletionDate: Date.now() + ms('5h')
			});

			await joinFakeParticipant(roomId, 'test-participant');

			const response = await deleteRoom(roomId, { force: false });

			expect(response.status).toBe(202);

			const roomResponse = await getRoom(roomId);
			expect(roomResponse.body).toBeDefined();
			expect(roomResponse.body.roomId).toBe(roomId);
			expect(roomResponse.body.markedForDeletion).toBeDefined();
			expect(roomResponse.body.markedForDeletion).toBe(true);

			disconnectFakeParticipants();

			const responseAfterDelete = await getRoom(roomId);
			expect(responseAfterDelete.status).toBe(404);
		});

		it('should force delete (204) room with active participants when force=true', async () => {
			const { roomId } = await createRoom({
				roomIdPrefix: 'test-room'
			});

			await joinFakeParticipant(roomId, 'test-participant');

			const response = await deleteRoom(roomId, { force: true });

			expect(response.status).toBe(204);

			// Try to retrieve the room again
			const responseAfterDelete = await getRoom(roomId);
			expect(responseAfterDelete.status).toBe(404);
		});

		it('should successfully delete a room already marked for deletion', async () => {
			const { roomId } = await createRoom({ roomIdPrefix: 'test-marked' });

			// First mark it for deletion
			await joinFakeParticipant(roomId, 'test-participant');

			await deleteRoom(roomId, { force: false });

			// Then try to delete it again
			const response = await deleteRoom(roomId, { force: true });
			expect(response.status).toBe(204);
		});

		it('should handle repeated deletion of the same room gracefully', async () => {
			const { roomId } = await createRoom({ roomIdPrefix: 'test-idempotent' });

			// Delete first time
			const response1 = await deleteRoom(roomId);
			expect(response1.status).toBe(204);

			// Delete second time - should still return 204 (no error)
			const response2 = await deleteRoom(roomId);
			expect(response2.status).toBe(204);
		});
	});

	describe('Delete Room Validation failures', () => {
		it('should fail when roomId becomes empty after sanitization', async () => {
			const response = await deleteRoom('!!-*!@#$%^&*()_+{}|:"<>?');

			expect(response.status).toBe(422);
			// Expect an error message indicating the resulting roomId is empty.
			expect(response.body.error).toContain('Unprocessable Entity');
			expect(JSON.stringify(response.body.details)).toContain('roomId cannot be empty after sanitization');
		});

		it('should fail when force parameter is a number instead of boolean', async () => {
			const response = await deleteRoom('testRoom', { force: { value: 123 } });

			expect(response.status).toBe(422);
			expect(response.body.error).toContain('Unprocessable Entity');
			expect(JSON.stringify(response.body.details)).toContain('Expected boolean, received object');
		});
	});
});
