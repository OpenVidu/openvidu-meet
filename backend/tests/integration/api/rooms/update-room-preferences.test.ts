import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { container } from '../../../../src/config/index.js';
import { FrontendEventService } from '../../../../src/services/index.js';
import { MeetSignalType } from '../../../../src/typings/ce/event.model.js';
import { MeetRecordingAccess } from '../../../../src/typings/ce/index.js';
import {
	createRoom,
	deleteAllRooms,
	getRoom,
	startTestServer,
	updateRoomConfig
} from '../../../helpers/request-helpers.js';

describe('Room API Tests', () => {
	beforeAll(() => {
		startTestServer();
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
					virtualBackground: { enabled: true }
				}
			});

			// Update the room config
			const updatedConfig = {
				recording: {
					enabled: false,
					allowAccessTo: MeetRecordingAccess.ADMIN
				},
				chat: { enabled: false },
				virtualBackground: { enabled: false }
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

		it('should allow partial preference updates', async () => {
			// Create a room first with all config enabled
			const createdRoom = await createRoom({
				roomName: 'partial-update',
				config: {
					recording: {
						enabled: true,
						allowAccessTo: MeetRecordingAccess.ADMIN_MODERATOR_SPEAKER
					},
					chat: { enabled: true },
					virtualBackground: { enabled: true }
				}
			});

			// Update only one preference
			const partialConfig = {
				recording: {
					enabled: false,
					allowAccessTo: MeetRecordingAccess.ADMIN_MODERATOR_SPEAKER
				},
				chat: { enabled: true },
				virtualBackground: { enabled: true }
			};
			const updateResponse = await updateRoomConfig(createdRoom.roomId, partialConfig);

			// Verify update response
			expect(updateResponse.status).toBe(200);
			expect(updateResponse.body).toHaveProperty('message');

			// Verify with a get request
			const getResponse = await getRoom(createdRoom.roomId);
			expect(getResponse.status).toBe(200);
			expect(getResponse.body.config).toEqual(partialConfig);
		});
	});

	describe('Update Room Config Validation failures', () => {
		it('should fail when config has incorrect structure', async () => {
			const { roomId } = await createRoom({
				roomName: 'validation-test'
			});

			// Invalid config (missing required fields)
			const invalidConfig = {
				recording: {
					enabled: false
				},
				// Missing chat config
				virtualBackground: { enabled: false }
			};
			const response = await updateRoomConfig(roomId, invalidConfig);

			expect(response.status).toBe(422);
			expect(response.body.error).toContain('Unprocessable Entity');
			expect(JSON.stringify(response.body.details)).toContain('chat');
		});

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
			const response = await updateRoomConfig(createdRoom.roomId, invalidConfig);

			expect(response.status).toBe(422);
			expect(response.body.error).toContain('Unprocessable Entity');
			expect(JSON.stringify(response.body.details)).toContain('recording.enabled');
		});

		it('should fail when config is missing required properties', async () => {
			const createdRoom = await createRoom({
				roomName: 'missing-props'
			});

			const emptyConfig = {};
			const response = await updateRoomConfig(createdRoom.roomId, emptyConfig);

			expect(response.status).toBe(422);
			expect(response.body.error).toContain('Unprocessable Entity');
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
});
