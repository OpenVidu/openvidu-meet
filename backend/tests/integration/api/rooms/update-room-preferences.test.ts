import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { MeetRecordingAccess } from '../../../../src/typings/ce/index.js';
import {
	createRoom,
	deleteAllRooms,
	getRoom,
	startTestServer,
	updateRoomPreferences
} from '../../../helpers/request-helpers.js';
import { FrontendEventService } from '../../../../src/services/index.js';
import { container } from '../../../../src/config/index.js';
import { MeetSignalType } from '../../../../src/typings/ce/event.model.js';

describe('Room API Tests', () => {
	beforeAll(() => {
		startTestServer();
	});

	afterEach(async () => {
		// Remove all rooms created
		await deleteAllRooms();
	});

	describe('Update Room Preferences Tests', () => {
		let frontendEventService: FrontendEventService;

		beforeAll(() => {
			// Ensure the FrontendEventService is registered
			frontendEventService = container.get(FrontendEventService);
		});

		it('should successfully update room preferences', async () => {
			const sendSignalSpy = jest.spyOn(frontendEventService as any, 'sendSignal');
			const createdRoom = await createRoom({
				roomName: 'update-test',
				preferences: {
					recordingPreferences: {
						enabled: true,
						allowAccessTo: MeetRecordingAccess.ADMIN_MODERATOR_SPEAKER
					},
					chatPreferences: { enabled: true },
					virtualBackgroundPreferences: { enabled: true }
				}
			});

			// Update the room preferences
			const updatedPreferences = {
				recordingPreferences: {
					enabled: false,
					allowAccessTo: MeetRecordingAccess.ADMIN
				},
				chatPreferences: { enabled: false },
				virtualBackgroundPreferences: { enabled: false }
			};
			const updateResponse = await updateRoomPreferences(createdRoom.roomId, updatedPreferences);

			// Verify a method of frontend event service is called
			expect(sendSignalSpy).toHaveBeenCalledWith(
				createdRoom.roomId,
				{
					roomId: createdRoom.roomId,
					preferences: updatedPreferences,
					timestamp: expect.any(Number)
				},
				{
					topic: MeetSignalType.MEET_ROOM_PREFERENCES_UPDATED
				}
			);

			// Verify update response
			expect(updateResponse.status).toBe(200);
			expect(updateResponse.body).toHaveProperty('message');

			// Verify with a get request
			const getResponse = await getRoom(createdRoom.roomId);
			expect(getResponse.status).toBe(200);
			expect(getResponse.body.preferences).toEqual(updatedPreferences);
		});

		it('should allow partial preference updates', async () => {
			// Create a room first with all preferences enabled
			const createdRoom = await createRoom({
				roomName: 'partial-update',
				preferences: {
					recordingPreferences: {
						enabled: true,
						allowAccessTo: MeetRecordingAccess.ADMIN_MODERATOR_SPEAKER
					},
					chatPreferences: { enabled: true },
					virtualBackgroundPreferences: { enabled: true }
				}
			});

			// Update only one preference
			const partialPreferences = {
				recordingPreferences: {
					enabled: false,
					allowAccessTo: MeetRecordingAccess.ADMIN_MODERATOR_SPEAKER
				},
				chatPreferences: { enabled: true },
				virtualBackgroundPreferences: { enabled: true }
			};
			const updateResponse = await updateRoomPreferences(createdRoom.roomId, partialPreferences);

			// Verify update response
			expect(updateResponse.status).toBe(200);
			expect(updateResponse.body).toHaveProperty('message');

			// Verify with a get request
			const getResponse = await getRoom(createdRoom.roomId);
			expect(getResponse.status).toBe(200);
			expect(getResponse.body.preferences).toEqual(partialPreferences);
		});
	});

	describe('Update Room Preferences Validation failures', () => {
		it('should fail when preferences have incorrect structure', async () => {
			const { roomId } = await createRoom({
				roomName: 'validation-test'
			});

			// Invalid preferences (missing required fields)
			const invalidPreferences = {
				recordingPreferences: {
					enabled: false
				},
				// Missing chatPreferences
				virtualBackgroundPreferences: { enabled: false }
			};
			const response = await updateRoomPreferences(roomId, invalidPreferences);

			expect(response.status).toBe(422);
			expect(response.body.error).toContain('Unprocessable Entity');
			expect(JSON.stringify(response.body.details)).toContain('chatPreferences');
		});

		it('should fail when preferences have incorrect types', async () => {
			const createdRoom = await createRoom({
				roomName: 'type-test'
			});

			// Invalid preferences (wrong types)
			const invalidPreferences = {
				recordingPreferences: {
					enabled: 'true', // String instead of boolean
					allowAccessTo: MeetRecordingAccess.ADMIN_MODERATOR_SPEAKER
				},
				chatPreferences: { enabled: false },
				virtualBackgroundPreferences: { enabled: false }
			};
			const response = await updateRoomPreferences(createdRoom.roomId, invalidPreferences);

			expect(response.status).toBe(422);
			expect(response.body.error).toContain('Unprocessable Entity');
			expect(JSON.stringify(response.body.details)).toContain('recordingPreferences.enabled');
		});

		it('should fail when preferences are missing required properties', async () => {
			const createdRoom = await createRoom({
				roomName: 'missing-props'
			});

			const emptyPreferences = {};
			const response = await updateRoomPreferences(createdRoom.roomId, emptyPreferences);

			expect(response.status).toBe(422);
			expect(response.body.error).toContain('Unprocessable Entity');
		});

		it('should fail when recording is enabled but allowAccessTo is missing', async () => {
			const createdRoom = await createRoom({
				roomName: 'missing-access'
			});

			const invalidPreferences = {
				recordingPreferences: {
					enabled: true // Missing allowAccessTo
				},
				chatPreferences: { enabled: false },
				virtualBackgroundPreferences: { enabled: false }
			};
			const response = await updateRoomPreferences(createdRoom.roomId, invalidPreferences);

			expect(response.status).toBe(422);
			expect(response.body.error).toContain('Unprocessable Entity');
			expect(JSON.stringify(response.body.details)).toContain('recordingPreferences.allowAccessTo');
		});

		it('should return 404 when updating non-existent room', async () => {
			const nonExistentRoomId = 'non-existent-room';

			const preferences = {
				recordingPreferences: {
					enabled: false,
					allowAccessTo: MeetRecordingAccess.ADMIN_MODERATOR_SPEAKER
				},
				chatPreferences: { enabled: false },
				virtualBackgroundPreferences: { enabled: false }
			};
			const response = await updateRoomPreferences(nonExistentRoomId, preferences);

			expect(response.status).toBe(404);
			expect(response.body.message).toContain(`'${nonExistentRoomId}' does not exist`);
		});
	});
});
