import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import {
	createRoom,
	deleteAllRooms,
	startTestServer,
	getRoom,
	joinFakeParticipant,
	disconnectFakeParticipants,
	bulkDeleteRooms
} from '../../../utils/helpers.js';

describe('Room API Tests', () => {
	beforeAll(async () => {
		startTestServer();
	});

	afterAll(async () => {

	});

	afterEach(async () => {
		// Remove all rooms created
		await disconnectFakeParticipants();
		await deleteAllRooms();
	});

	describe('Bulk Delete Room Tests', () => {
		it('should return 204 when room does not exist (idempotent deletion)', async () => {
			// The roomId will be transformed to string
			const response = await bulkDeleteRooms([{ invalid: 'format' }], true);

			expect(response.status).toBe(204);
			expect(response.body).toStrictEqual({});
		});

		it('should delete room (204) with invalid force parameter when no participants exist', async () => {
			const { roomId } = await createRoom({ roomIdPrefix: 'test-invalid-force' });

			const response = await bulkDeleteRooms([roomId]);

			//The bulk operation for only one room should be the same as deleting the room
			expect(response.status).toBe(204);
			expect(response.body).toStrictEqual({});
		});

		it('should mark room for deletion (202) with invalid force parameter when participants exist', async () => {
			const { roomId } = await createRoom({ roomIdPrefix: 'test-invalid-force' });

			await joinFakeParticipant(roomId, 'test-participant-1');

			const response = await bulkDeleteRooms([roomId]);

			//The bulk operation for only one room should be the same as deleting the room
			expect(response.status).toBe(202);
			expect(response.body.message).toContain('marked for deletion');
		});

		it('should delete room (204) with force=true parameter when no participants exist', async () => {
			const { roomId } = await createRoom({ roomIdPrefix: 'test-force' });

			const response = await bulkDeleteRooms([roomId], true);

			//The bulk operation for only one room should be the same as deleting the room
			expect(response.status).toBe(204);
			expect(response.body).toStrictEqual({});
		});

		it('should delete room (204) with force=true parameter when participants exist', async () => {
			const { roomId } = await createRoom({ roomIdPrefix: 'test-force' });

			await joinFakeParticipant(roomId, 'test-participant-1');

			const response = await bulkDeleteRooms([roomId], true);

			//The bulk operation for only one room should be the same as deleting the room
			expect(response.status).toBe(204);
			expect(response.body).toStrictEqual({});
		});

		it('should successfully delete the room requesting the same roomId multiple times', async () => {
			const { roomId } = await createRoom({ roomIdPrefix: 'test-duplicate' });

			const response = await bulkDeleteRooms([roomId, roomId, roomId], true);

			expect(response.status).toBe(204);
			expect(response.body).toStrictEqual({});
		});

		it('should successfully delete valid roomIds while ignoring invalid ones', async () => {
			const { roomId } = await createRoom({ roomIdPrefix: 'test-invalid-force' });

			const response = await bulkDeleteRooms([roomId, '!!@##$']);

			expect(response.status).toBe(204);
			expect(response.body).toStrictEqual({});
		});

		it('should successfully delete multiple rooms with valid roomIds', async () => {
			// Create test rooms
			const [room1, room2] = await Promise.all([
				createRoom({ roomIdPrefix: 'test-bulk-1' }),
				createRoom({ roomIdPrefix: 'test-bulk-2' })
			]);

			// Delete both rooms
			const response = await bulkDeleteRooms([room1.roomId, room2.roomId]);

			expect(response.status).toBe(204);
			expect(response.body).toStrictEqual({});

			// Verify that the rooms are deleted
			const getRoom1 = await getRoom(room1.roomId);
			const getRoom2 = await getRoom(room2.roomId);
			expect(getRoom1.status).toBe(404);
			expect(getRoom2.status).toBe(404);
			expect(getRoom1.body.message).toContain(`'${room1.roomId}' does not exist`);
			expect(getRoom2.body.message).toContain(`'${room2.roomId}' does not exist`);
		});

		it('should successfully marked for deletion multiple rooms with valid roomIds', async () => {
			// Create test rooms
			const [room1, room2] = await Promise.all([
				createRoom({ roomIdPrefix: 'test-bulk-1' }),
				createRoom({ roomIdPrefix: 'test-bulk-2' })
			]);

			await Promise.all([
				joinFakeParticipant(room1.roomId, 'test-participant-1'),
				joinFakeParticipant(room2.roomId, 'test-participant-2')
			]);

			// Delete both rooms
			const response = await bulkDeleteRooms([room1.roomId, room2.roomId]);

			expect(response.status).toBe(202);

			expect(response.body.message).toContain(`Rooms ${room1.roomId}, ${room2.roomId} marked for deletion`);
			expect(response.body.deleted).toBeUndefined();

			// Verify that the rooms are marked for deletion
			const getRoom1 = await getRoom(room1.roomId);
			const getRoom2 = await getRoom(room2.roomId);
			expect(getRoom1.status).toBe(200);
			expect(getRoom2.status).toBe(200);
			expect(getRoom1.body.roomId).toBe(room1.roomId);
			expect(getRoom2.body.roomId).toBe(room2.roomId);
			expect(getRoom1.body.markedForDeletion).toBe(true);
			expect(getRoom2.body.markedForDeletion).toBe(true);
		});

		it('should sanitize roomIds before deleting', async () => {
			// Create a test room
			const { roomId } = await createRoom({ roomIdPrefix: 'test-sanitize' });

			const response = await bulkDeleteRooms([roomId + '!!@##$']);
			expect(response.status).toBe(204);
			expect(response.body).toStrictEqual({});
			const deletedRoom = await getRoom(roomId);
			expect(deletedRoom.status).toBe(404);
			expect(deletedRoom.body.message).toContain(`'${roomId}' does not exist`);
		});

		it('should delete rooms when force=true and participants exist', async () => {
			// Create a test room
			const [room1, room2] = await Promise.all([
				createRoom({ roomIdPrefix: 'test-bulk-1' }),
				createRoom({ roomIdPrefix: 'test-bulk-2' })
			]);

			// Join a participant to the room
			await Promise.all([
				joinFakeParticipant(room1.roomId, 'test-participant-1'),
				joinFakeParticipant(room2.roomId, 'test-participant-2')
			]);

			// Attempt to delete the room with force=false
			const response = await bulkDeleteRooms([room1.roomId, room2.roomId], true);

			expect(response.status).toBe(204);
			expect(response.body).toStrictEqual({});

			// Verify that the room is deleted
			const deletedRoom1 = await getRoom(room1.roomId);
			const deletedRoom2 = await getRoom(room2.roomId);
			expect(deletedRoom1.status).toBe(404);
			expect(deletedRoom1.body.message).toContain(`'${room1.roomId}' does not exist`);
			expect(deletedRoom2.status).toBe(404);
			expect(deletedRoom2.body.message).toContain(`'${room2.roomId}' does not exist`);
		});

		it('should return mixed results (200) when some rooms are deleted and others marked for deletion', async () => {
			// Create rooms
			const room1 = await createRoom({ roomIdPrefix: 'empty-room' });
			const room2 = await createRoom({ roomIdPrefix: 'occupied-room' });

			// Add participant to only one room
			await joinFakeParticipant(room2.roomId, 'test-participant');

			// Delete both rooms (without force)
			const response = await bulkDeleteRooms([room1.roomId, room2.roomId], false);

			// Should return 200 with mixed results
			expect(response.status).toBe(200);
			expect(response.body.deleted).toHaveLength(1);
			expect(response.body.deleted).toContain(room1.roomId);
			expect(response.body.markedForDeletion).toHaveLength(1);
			expect(response.body.markedForDeletion).toContain(room2.roomId);

			// Verify deletion state
			const getRoom1 = await getRoom(room1.roomId);
			const getRoom2 = await getRoom(room2.roomId);
			expect(getRoom1.status).toBe(404);
			expect(getRoom2.status).toBe(200);
		});

		it('should handle a large number of room IDs', async () => {
			// Create 20+ rooms and test deletion
			const rooms = await Promise.all(
				Array.from({ length: 20 }, (_, i) => createRoom({ roomIdPrefix: `bulk-${i}` }))
			);

			const response = await bulkDeleteRooms(rooms.map((r) => r.roomId));
			expect(response.status).toBe(204);

			// Verify all rooms are deleted
			for (const room of rooms) {
				const getResponse = await getRoom(room.roomId);
				expect(getResponse.status).toBe(404);
			}
		});

		it('should handle a large number of room IDs with mixed valid and invalid IDs', async () => {
			// Create 20+ rooms and test deletion
			const rooms = await Promise.all(
				Array.from({ length: 20 }, (_, i) => createRoom({ roomIdPrefix: `bulk-${i}` }))
			);

			await joinFakeParticipant(rooms[0].roomId, 'test-participant-1');

			const response = await bulkDeleteRooms([
				...rooms.map((r) => r.roomId),
				'!!@##$',
				',,,,',
				'room-1',
				'room-2'
			]);

			expect(response.status).toBe(200);

			// Verify all valid rooms are deleted
			for (const room of rooms) {
				if (room.roomId === rooms[0].roomId) {
					continue; // Skip the room with a participant
				}

				const getResponse = await getRoom(room.roomId);
				expect(getResponse.status).toBe(404);
			}

			// Verify the room with a participant is marked for deletion
			const getResponse = await getRoom(rooms[0].roomId);
			expect(getResponse.status).toBe(200);
			expect(getResponse.body.markedForDeletion).toBe(true);
			expect(getResponse.body.roomId).toBe(rooms[0].roomId);
		});
	});

	describe('Bulk delete Room Validation failures', () => {
		it('should handle empty roomIds array (no rooms deleted)', async () => {
			const response = await bulkDeleteRooms([]);

			expect(response.status).toBe(422);
			expect(response.body.error).toContain('Unprocessable Entity');
			expect(JSON.stringify(response.body.details)).toContain(
				'At least one valid roomId is required after sanitization'
			);
		});
		it('should fail when roomIds contains an ID that becomes empty after sanitization', async () => {
			const response = await bulkDeleteRooms([',,,,']);

			expect(response.status).toBe(422);

			expect(response.body.error).toContain('Unprocessable Entity');
			expect(JSON.stringify(response.body.details)).toContain(
				'At least one valid roomId is required after sanitization'
			);
		});

		it('should validate roomIds and return 422 when all are invalid', async () => {
			const response = await bulkDeleteRooms(['!!@##$', '!!@##$', ',', '.,-------}{¡$#<+']);

			expect(response.status).toBe(422);
			expect(response.body.error).toContain('Unprocessable Entity');
			expect(JSON.stringify(response.body.details)).toContain(
				'At least one valid roomId is required after sanitization'
			);
		});
	});
});
