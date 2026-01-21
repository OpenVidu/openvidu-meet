import { afterAll, beforeAll, describe, it } from '@jest/globals';
import { MeetRecordingLayout } from '@openvidu-meet/typings';
import { expectValidRoom } from '../../../helpers/assertion-helpers.js';
import { createRoom, deleteAllRooms, startTestServer } from '../../../helpers/request-helpers.js';

describe('Room API Tests', () => {
	beforeAll(async () => {
		await startTestServer();
	});

	afterAll(async () => {
		await deleteAllRooms();
	});
	describe('Recording Layout Tests', () => {
		it('Should create a room with default grid layout when layout is not specified', async () => {
			const payload = {
				roomName: 'Room with Default Layout',
				config: {
					recording: {
						enabled: true
					}
				}
			};

			const room = await createRoom(payload);

			const expectedConfig = {
				recording: {
					enabled: true,
					layout: MeetRecordingLayout.GRID // Default value
				},
				chat: { enabled: true },
				virtualBackground: { enabled: true },
				e2ee: { enabled: false }
			};
			expectValidRoom(room, 'Room with Default Layout', 'room_with_default_layout', expectedConfig);
		});

		it('Should create a room with speaker layout', async () => {
			const payload = {
				roomName: 'Speaker Layout Room',
				config: {
					recording: {
						enabled: true,
						layout: MeetRecordingLayout.SPEAKER
					}
				}
			};

			const room = await createRoom(payload);

			const expectedConfig = {
				recording: {
					enabled: true,
					layout: MeetRecordingLayout.SPEAKER
				},
				chat: { enabled: true },
				virtualBackground: { enabled: true },
				e2ee: { enabled: false }
			};
			expectValidRoom(room, 'Speaker Layout Room', 'speaker_layout_room', expectedConfig);
		});

		it('Should create a room with single-speaker layout', async () => {
			const payload = {
				roomName: 'Single Speaker Layout Room',
				config: {
					recording: {
						enabled: true,
						layout: MeetRecordingLayout.SINGLE_SPEAKER
					}
				}
			};

			const room = await createRoom(payload);

			const expectedConfig = {
				recording: {
					enabled: true,
					layout: MeetRecordingLayout.SINGLE_SPEAKER
				},
				chat: { enabled: true },
				virtualBackground: { enabled: true },
				e2ee: { enabled: false }
			};
			expectValidRoom(room, 'Single Speaker Layout Room', 'single_speaker_layout_room', expectedConfig);
		});
	});
});
