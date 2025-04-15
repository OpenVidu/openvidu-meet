import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import { createRoom, deleteAllRooms, startTestServer, stopTestServer, getRoom } from '../../../utils/helpers.js';
import ms from 'ms';

describe('OpenVidu Meet Room API Tests', () => {
	beforeAll(async () => {
		await startTestServer();
	});

	afterAll(async () => {
		await stopTestServer();
	});

	afterEach(async () => {
		// Remove all rooms created
		await deleteAllRooms();
	});

	describe('Get Room Tests', () => {
		it('should successfully retrieve a room by its ID', async () => {
			const createdRoom = await createRoom({
				roomIdPrefix: 'test-room'
			});

			const response = await getRoom(createdRoom.roomId);
			expect(response.status).toBe(200);
			expect(response.body).toBeDefined();
			expect(response.body.roomIdPrefix).toBe('test-room');

			expect(response.body.roomId).toBe(createdRoom.roomId);
			expect(response.body.creationDate).toBeDefined();
			expect(response.body.autoDeletionDate).not.toBeDefined();
			expect(response.body.preferences).toEqual({
				recordingPreferences: { enabled: true },
				chatPreferences: { enabled: true },
				virtualBackgroundPreferences: { enabled: true }
			});
			expect(response.body.moderatorRoomUrl).toBeDefined();
			expect(response.body.publisherRoomUrl).toBeDefined();
		});

		it('should retrieve a room with custom preferences', async () => {
			// Create a room with custom preferences
			const createdRoom = await createRoom({
				roomIdPrefix: 'custom-prefs',
				preferences: {
					recordingPreferences: { enabled: false },
					chatPreferences: { enabled: false },
					virtualBackgroundPreferences: { enabled: true }
				}
			});

			// Get the roomId from the created room
			const roomId = createdRoom.roomId;

			// Retrieve the room by its ID
			const response = await getRoom(roomId);

			// Verify custom preferences
			expect(response.status).toBe(200);
			expect(response.body.roomId).toBe(roomId);
			expect(response.body.preferences).toEqual({
				recordingPreferences: { enabled: false },
				chatPreferences: { enabled: false },
				virtualBackgroundPreferences: { enabled: true }
			});
		});

		it('should retrieve only specified fields when using fields parameter', async () => {
			// Create a room
			const createdRoom = await createRoom({
				roomIdPrefix: 'field-filtered'
			});

			// Get the room with field filtering
			const response = await getRoom(createdRoom.roomId, 'roomId,roomIdPrefix');

			// Verify that only the requested fields are returned
			expect(response.status).toBe(200);
			expect(response.body.roomId).toBeDefined();
			expect(response.body.roomIdPrefix).toBeDefined();

			// Other fields should not be present
			expect(response.body.creationDate).not.toBeDefined();
			expect(response.body.preferences).not.toBeDefined();
			expect(response.body.moderatorRoomUrl).not.toBeDefined();
			expect(response.body.publisherRoomUrl).not.toBeDefined();
		});

		it('should handle roomId with characters that need sanitization', async () => {
			// Create a room
			const createdRoom = await createRoom({
				roomIdPrefix: 'test-room'
			});

			const dirtyRoomId = ' ' + createdRoom.roomId + ' '; // Add spaces that should be trimmed

			const response = await getRoom(dirtyRoomId);

			// The endpoint should sanitize the roomId and still find the room
			expect(response.status).toBe(200);
			expect(response.body.roomId).toBe(createdRoom.roomId);
		});

		it('should retrieve a room with autoDeletionDate', async () => {
			// Use validAutoDeletionDate that's defined in the test file or create here
			const validAutoDeletionDate = Date.now() + ms('2h');

			// Create a room with autoDeletionDate
			const createdRoom = await createRoom({
				roomIdPrefix: 'deletion-date',
				autoDeletionDate: validAutoDeletionDate
			});

			// Get the room
			const response = await getRoom(createdRoom.roomId);

			// Verify autoDeletionDate
			expect(response.status).toBe(200);
			expect(response.body.autoDeletionDate).toBe(validAutoDeletionDate);
		});
	});

	describe('Get Room Validation failures', () => {
		it('should fail when roomId becomes empty after sanitization', async () => {
			const response = await getRoom('!!-*!@#$%^&*()_+{}|:"<>?');

			expect(response.status).toBe(422);
			// Expect an error message indicating the resulting roomId is empty.
			expect(response.body.error).toContain('Unprocessable Entity');
			expect(JSON.stringify(response.body.details)).toContain('roomId cannot be empty after sanitization');
		});
	});
});
