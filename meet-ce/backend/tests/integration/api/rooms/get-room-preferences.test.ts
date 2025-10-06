import { afterEach, beforeAll, describe, it } from '@jest/globals';
import { MeetRecordingAccess } from '@openvidu-meet/typings';
import { expectSuccessRoomConfigResponse } from '../../../helpers/assertion-helpers.js';
import { deleteAllRooms, getRoomConfig, startTestServer } from '../../../helpers/request-helpers.js';
import { setupSingleRoom } from '../../../helpers/test-scenarios.js';

describe('Room API Tests', () => {
	const DEFAULT_CONFIG = {
		recording: {
			enabled: true,
			allowAccessTo: MeetRecordingAccess.ADMIN_MODERATOR_SPEAKER
		},
		chat: { enabled: true },
		virtualBackground: { enabled: true }
	};

	beforeAll(() => {
		startTestServer();
	});

	afterEach(async () => {
		// Remove all rooms created
		await deleteAllRooms();
	});

	describe('Get Room Config Tests', () => {
		it('should successfully retrieve a room by its ID', async () => {
			const roomData = await setupSingleRoom();
			const roomId = roomData.room.roomId;

			const response = await getRoomConfig(roomId);
			expectSuccessRoomConfigResponse(response, DEFAULT_CONFIG);
		});

		it('should retrieve custom room config', async () => {
			const payload = {
				roomName: 'custom-config',
				config: {
					recording: {
						enabled: true,
						allowAccessTo: MeetRecordingAccess.ADMIN_MODERATOR_SPEAKER
					},
					chat: { enabled: true },
					virtualBackground: { enabled: false }
				}
			};

			const roomData = await setupSingleRoom(false, payload.roomName, payload.config);
			const roomId = roomData.room.roomId;

			const response = await getRoomConfig(roomId);
			expectSuccessRoomConfigResponse(response, payload.config);
		});
	});
});
