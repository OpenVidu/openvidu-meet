import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { MeetRecordingAccess, MeetRoomConfig, MeetSignalType } from '@openvidu-meet/typings';
import { container } from '../../../../src/config/index.js';
import { FrontendEventService } from '../../../../src/services/index.js';
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
		let frontendEventService: FrontendEventService;

		beforeAll(() => {
			// Ensure the FrontendEventService is registered
			frontendEventService = container.get(FrontendEventService);
		});

		it('should successfully update room config', async () => {
			const sendSignalSpy = jest.spyOn(frontendEventService as any, 'sendSignal');
			const createdRoom = await createRoom({
				roomName: 'update-test',
				config: {
					recording: {
						enabled: true,
						allowAccessTo: MeetRecordingAccess.ADMIN_MODERATOR_SPEAKER
					},
					chat: { enabled: true },
					virtualBackground: { enabled: true },
					e2ee: { enabled: false }
				}
			});

			// Update the room config
			const updatedConfig = {
				recording: {
					enabled: false,
					allowAccessTo: MeetRecordingAccess.ADMIN
				},
				chat: { enabled: false },
				virtualBackground: { enabled: false },
				e2ee: { enabled: true }
			};
			const updateResponse = await updateRoomConfig(createdRoom.roomId, updatedConfig);

			// Verify a method of frontend event service is called
			expect(sendSignalSpy).toHaveBeenCalledWith(
				createdRoom.roomId,
				{
					roomId: createdRoom.roomId,
					config: updatedConfig,
					timestamp: expect.any(Number)
				},
				{
					topic: MeetSignalType.MEET_ROOM_CONFIG_UPDATED
				}
			);

			// Verify update response
			expect(updateResponse.status).toBe(200);
			expect(updateResponse.body).toHaveProperty('message');

			// Verify with a get request
			const getResponse = await getRoom(createdRoom.roomId);
			expect(getResponse.status).toBe(200);
			expect(getResponse.body.config).toEqual(updatedConfig);
		});

		it('should allow partial config updates', async () => {
			// Create a room first with all config enabled
			const createdRoom = await createRoom({
				roomName: 'partial-update',
				config: {
					recording: {
						enabled: true,
						allowAccessTo: MeetRecordingAccess.ADMIN_MODERATOR_SPEAKER
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
					enabled: false
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
					enabled: false,
					allowAccessTo: MeetRecordingAccess.ADMIN_MODERATOR_SPEAKER
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
					enabled: 'true', // String instead of boolean
					allowAccessTo: MeetRecordingAccess.ADMIN_MODERATOR_SPEAKER
				},
				chat: { enabled: false },
				virtualBackground: { enabled: false }
			};
			const response = await updateRoomConfig(createdRoom.roomId, invalidConfig as unknown as MeetRoomConfig);

			expect(response.status).toBe(422);
			expect(response.body.error).toContain('Unprocessable Entity');
			expect(JSON.stringify(response.body.details)).toContain('recording.enabled');
		});

		it('should fail when recording is enabled but allowAccessTo is missing', async () => {
			const createdRoom = await createRoom({
				roomName: 'missing-access'
			});

			const invalidConfig = {
				recording: {
					enabled: true // Missing allowAccessTo
				},
				chat: { enabled: false },
				virtualBackground: { enabled: false }
			};
			const response = await updateRoomConfig(createdRoom.roomId, invalidConfig);

			expect(response.status).toBe(422);
			expect(response.body.error).toContain('Unprocessable Entity');
			expect(JSON.stringify(response.body.details)).toContain('recording.allowAccessTo');
		});
	});
});
