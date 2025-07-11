import { afterEach, beforeAll, describe, it } from '@jest/globals';
import { MeetRecordingAccess, ParticipantRole } from '../../../../src/typings/ce/index.js';
import { expectSuccessRoomPreferencesResponse } from '../../../helpers/assertion-helpers.js';
import { deleteAllRooms, getRoomPreferences, startTestServer } from '../../../helpers/request-helpers.js';
import { setupSingleRoom } from '../../../helpers/test-scenarios.js';

describe('Room API Tests', () => {
	const DEFAULT_PREFERENCES = {
		recordingPreferences: {
			enabled: true,
			allowAccessTo: MeetRecordingAccess.ADMIN_MODERATOR_PUBLISHER
		},
		chatPreferences: { enabled: true },
		virtualBackgroundPreferences: { enabled: true }
	};

	beforeAll(() => {
		startTestServer();
	});

	afterEach(async () => {
		// Remove all rooms created
		await deleteAllRooms();
	});

	describe('Get Room Preferences Tests', () => {
		it('should successfully retrieve a room by its ID', async () => {
			const roomData = await setupSingleRoom();
			const roomId = roomData.room.roomId;
			const cookie = roomData.moderatorCookie;

			const response = await getRoomPreferences(roomId, cookie, ParticipantRole.MODERATOR);
			expectSuccessRoomPreferencesResponse(response, DEFAULT_PREFERENCES);
		});

		it('should retrieve custom room preferences', async () => {
			const payload = {
				roomIdPrefix: 'custom-prefs',
				preferences: {
					recordingPreferences: {
						enabled: true,
						allowAccessTo: MeetRecordingAccess.ADMIN_MODERATOR_PUBLISHER
					},
					chatPreferences: { enabled: true },
					virtualBackgroundPreferences: { enabled: false }
				}
			};

			const roomData = await setupSingleRoom(false, payload.roomIdPrefix, payload.preferences);
			const roomId = roomData.room.roomId;
			const cookie = roomData.moderatorCookie;

			const response = await getRoomPreferences(roomId, cookie, ParticipantRole.MODERATOR);
			expectSuccessRoomPreferencesResponse(response, payload.preferences);
		});
	});
});
