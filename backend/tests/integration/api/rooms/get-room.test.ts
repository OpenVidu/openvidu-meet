import { afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import ms from 'ms';
import { MeetRecordingAccess, ParticipantRole } from '../../../../src/typings/ce/index.js';
import {
	expectSuccessRoomResponse,
	expectValidationError,
	expectValidRoom,
	expectValidRoomWithFields
} from '../../../helpers/assertion-helpers.js';
import { createRoom, deleteAllRooms, getRoom, startTestServer } from '../../../helpers/request-helpers.js';
import { setupSingleRoom } from '../../../helpers/test-scenarios.js';

describe('Room API Tests', () => {
	beforeAll(() => {
		startTestServer();
	});

	afterEach(async () => {
		// Remove all rooms created
		await deleteAllRooms();
	});

	describe('Get Room Tests', () => {
		it('should successfully retrieve a room by its ID', async () => {
			const createdRoom = await createRoom({
				roomName: 'test-room'
			});

			expectValidRoom(createdRoom, 'test-room');

			const response = await getRoom(createdRoom.roomId);
			expectSuccessRoomResponse(response, 'test-room');
		});

		it('should retrieve a room with custom preferences', async () => {
			const payload = {
				roomName: 'custom-prefs',
				preferences: {
					recordingPreferences: {
						enabled: true,
						allowAccessTo: MeetRecordingAccess.ADMIN_MODERATOR_SPEAKER
					},
					chatPreferences: { enabled: true },
					virtualBackgroundPreferences: { enabled: false }
				}
			};
			// Create a room with custom preferences
			const { roomId } = await createRoom(payload);

			// Retrieve the room by its ID
			const response = await getRoom(roomId);

			expectSuccessRoomResponse(response, 'custom-prefs', undefined, payload.preferences);
		});

		it('should retrieve only specified fields when using fields parameter', async () => {
			// Create a room
			const createdRoom = await createRoom({
				roomName: 'field-filtered'
			});

			// Get the room with field filtering
			const response = await getRoom(createdRoom.roomId, 'roomId,roomName');

			// Verify that only the requested fields are returned
			expect(response.status).toBe(200);

			expectValidRoomWithFields(response.body, ['roomId', 'roomName']);
		});

		it('should handle roomId with characters that need sanitization', async () => {
			// Create a room
			const createdRoom = await createRoom({
				roomName: 'test-room'
			});

			const dirtyRoomId = ' ' + createdRoom.roomId + ' '; // Add spaces that should be trimmed

			const response = await getRoom(dirtyRoomId);

			expectSuccessRoomResponse(response, 'test-room');
		});

		it('should retrieve a room with autoDeletionDate', async () => {
			// Use validAutoDeletionDate that's defined in the test file or create here
			const validAutoDeletionDate = Date.now() + ms('2h');

			// Create a room with autoDeletionDate
			const createdRoom = await createRoom({
				roomName: 'deletion-date',
				autoDeletionDate: validAutoDeletionDate
			});

			// Get the room
			const response = await getRoom(createdRoom.roomId);

			expectSuccessRoomResponse(response, 'deletion-date', validAutoDeletionDate);
		});

		it('should retrieve a room without moderatorUrl when participant is speaker', async () => {
			const roomData = await setupSingleRoom();
			const response = await getRoom(
				roomData.room.roomId,
				undefined,
				roomData.speakerCookie,
				ParticipantRole.SPEAKER
			);
			expect(response.status).toBe(200);
			expect(response.body.moderatorUrl).toBeUndefined();
		});

		it('should return 404 for a non-existent room', async () => {
			const fakeRoomId = 'non-existent-room-id';
			const response = await getRoom(fakeRoomId);
			expect(response.status).toBe(404);
			expect(response.body.message).toBe(`Room '${fakeRoomId}' does not exist`);
		});
	});

	describe('Get Room Validation failures', () => {
		it('should fail when roomId becomes empty after sanitization', async () => {
			const response = await getRoom('!!-*!@#$%^&*()_+{}|:"<>?');

			expectValidationError(response, 'roomId', 'cannot be empty after sanitization');
		});
	});
});
