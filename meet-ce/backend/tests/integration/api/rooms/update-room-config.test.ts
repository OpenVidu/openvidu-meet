import { afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import { MeetRecordingLayout, MeetRoomConfig } from '@openvidu-meet/typings';
import {
	createRoom,
	deleteAllRooms,
	getRoom,
	startTestServer,
	updateRoomConfig
} from '../../../helpers/request-helpers.js';
import { setupSingleRoom } from '../../../helpers/test-scenarios.js';

describe('Room API Tests', () => {
	beforeAll(async () => {
		await startTestServer();
	});

	afterEach(async () => {
		// Remove all rooms created
		await deleteAllRooms();
	});

	describe('Update Room Config Tests', () => {
		it('should successfully update room config', async () => {
			const createdRoom = await createRoom({
				roomName: 'update-test',
				config: {
					recording: {
						enabled: true
					},
					chat: { enabled: true },
					virtualBackground: { enabled: true },
					e2ee: { enabled: false }
				}
			});

			// Update the room config
			const updatedConfig = {
				recording: {
					enabled: false
				},
				chat: { enabled: false },
				virtualBackground: { enabled: false },
				e2ee: { enabled: true }
			};
			const updateResponse = await updateRoomConfig(createdRoom.roomId, updatedConfig);

			// Verify update response
			expect(updateResponse.status).toBe(200);
			expect(updateResponse.body).toHaveProperty('message');

			// Verify with a get request
			const getResponse = await getRoom(createdRoom.roomId);
			expect(getResponse.status).toBe(200);
			expect(getResponse.body.config).toEqual({
				...updatedConfig,
				recording: { ...updatedConfig.recording, layout: MeetRecordingLayout.GRID } // Layout remains unchanged
			});
		});

		it('should allow partial config updates', async () => {
			// Create a room first with all config enabled
			const createdRoom = await createRoom({
				roomName: 'partial-update',
				config: {
					recording: {
						enabled: true,
						layout: MeetRecordingLayout.SPEAKER
						// allowAccessTo: MeetRecordingAccess.ADMIN_MODERATOR_SPEAKER
					},
					chat: { enabled: true },
					virtualBackground: { enabled: true },
					e2ee: { enabled: false }
				}
			});

			// Update only one config field
			const partialConfig = {
				recording: {
					enabled: false
				}
			};
			const updateResponse = await updateRoomConfig(createdRoom.roomId, partialConfig);

			// Verify update response
			expect(updateResponse.status).toBe(200);
			expect(updateResponse.body).toHaveProperty('message');

			// Verify with a get request
			const getResponse = await getRoom(createdRoom.roomId);
			expect(getResponse.status).toBe(200);

			const expectedConfig: MeetRoomConfig = {
				recording: {
					enabled: false,
					layout: MeetRecordingLayout.SPEAKER
				},
				chat: { enabled: true },
				virtualBackground: { enabled: true },
				e2ee: { enabled: false }
			};
			expect(getResponse.body.config).toEqual(expectedConfig);
		});

		it('should reject room config update when there is an active meeting', async () => {
			// Create a room with active meeting
			const roomData = await setupSingleRoom(true);

			// Try to update room config
			const newConfig = {
				recording: {
					enabled: false
				},
				chat: {
					enabled: false
				},
				virtualBackground: {
					enabled: false
				},
				e2ee: {
					enabled: false
				}
			};

			const response = await updateRoomConfig(roomData.room.roomId, newConfig);
			expect(response.status).toBe(409);
			expect(response.body.error).toBe('Room Error');
			expect(response.body.message).toContain(`Room '${roomData.room.roomId}' has an active meeting`);
		});

		it('should return 404 when updating non-existent room', async () => {
			const nonExistentRoomId = 'non-existent-room';

			const config = {
				recording: {
					enabled: false
				},
				chat: { enabled: false },
				virtualBackground: { enabled: false }
			};
			const response = await updateRoomConfig(nonExistentRoomId, config);

			expect(response.status).toBe(404);
			expect(response.body.message).toContain(`'${nonExistentRoomId}' does not exist`);
		});
	});

	describe('Update Room Config Validation failures', () => {
		it('should fail when config has incorrect types', async () => {
			const createdRoom = await createRoom({
				roomName: 'type-test'
			});

			// Invalid config (wrong types)
			const invalidConfig = {
				recording: {
					enabled: 'true' // String instead of boolean
				},
				chat: { enabled: false },
				virtualBackground: { enabled: false }
			};
			const response = await updateRoomConfig(createdRoom.roomId, invalidConfig as unknown as MeetRoomConfig);

			expect(response.status).toBe(422);
			expect(response.body.error).toContain('Unprocessable Entity');
			expect(JSON.stringify(response.body.details)).toContain('recording.enabled');
		});
	});
});
