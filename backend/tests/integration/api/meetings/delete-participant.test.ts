import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { container } from '../../../../src/config/index.js';
import { OpenViduMeetError } from '../../../../src/models/error.model.js';
import { LiveKitService } from '../../../../src/services/index.js';
import {
	deleteAllRooms,
	deleteParticipant,
	deleteRoom,
	disconnectFakeParticipants,
	startTestServer
} from '../../../helpers/request-helpers.js';
import { RoomData, setupSingleRoom } from '../../../helpers/test-scenarios.js';

const participantName = 'TEST_PARTICIPANT';

describe('Meetings API Tests', () => {
	let livekitService: LiveKitService;
	let roomData: RoomData;

	beforeAll(async () => {
		startTestServer();
		livekitService = container.get(LiveKitService);
	});

	afterAll(async () => {
		await disconnectFakeParticipants();
		await deleteAllRooms();
	});

	describe('Delete Participant Tests', () => {
		beforeEach(async () => {
			roomData = await setupSingleRoom(true);
		});

		it('should remove participant from LiveKit room', async () => {
			// Check if participant exists before deletion
			const participant = await livekitService.getParticipant(roomData.room.roomId, participantName);
			expect(participant).toBeDefined();
			expect(participant.identity).toBe(participantName);

			// Delete the participant
			const response = await deleteParticipant(roomData.room.roomId, participantName, roomData.moderatorCookie);
			expect(response.status).toBe(200);

			// Check if the participant has been removed from LiveKit
			try {
				await livekitService.getParticipant(roomData.room.roomId, participantName);
			} catch (error) {
				expect((error as OpenViduMeetError).statusCode).toBe(404);
			}
		});

		it('should fail with 404 if participant does not exist', async () => {
			const response = await deleteParticipant(
				roomData.room.roomId,
				'NON_EXISTENT_PARTICIPANT',
				roomData.moderatorCookie
			);
			expect(response.status).toBe(404);
			expect(response.body.error).toBe('Participant Error');
		});

		it('should fail with 404 if room does not exist', async () => {
			// Delete the room to ensure it does not exist
			let response = await deleteRoom(roomData.room.roomId, { force: true });
			expect(response.status).toBe(204);

			response = await deleteParticipant(roomData.room.roomId, participantName, roomData.moderatorCookie);
			expect(response.status).toBe(404);
			expect(response.body.error).toBe('Room Error');
		});
	});
});
