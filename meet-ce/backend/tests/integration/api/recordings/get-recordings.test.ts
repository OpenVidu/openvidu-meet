import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { MeetRecordingInfo, MeetRecordingStatus, MeetRoom } from '@openvidu-meet/typings';
import {
	expectSuccessListRecordingResponse,
	expectValidationError,
	expectValidRecording,
	expectValidRecordingWithFields
} from '../../../helpers/assertion-helpers.js';
import {
	deleteAllRecordings,
	deleteAllRooms,
	disconnectFakeParticipants,
	generateRoomMemberToken,
	getAllRecordings,
	getAllRecordingsFromRoom,
	startTestServer
} from '../../../helpers/request-helpers.js';
import {
	RoomData,
	setupMultiRecordingsTestContext,
	setupSingleRoomWithRecording,
	TestContext
} from '../../../helpers/test-scenarios.js';

describe('Recordings API Tests', () => {
	let context: TestContext | null = null;
	let room: MeetRoom;

	beforeAll(async () => {
		await startTestServer();
	});

	describe('List Recordings Tests', () => {
		beforeEach(async () => {
			await Promise.all([deleteAllRooms(), deleteAllRecordings()]);
			const response = await getAllRecordings();
			expect(response.status).toBe(200);
			expectSuccessListRecordingResponse(response, 0, false, false);
		});

		afterAll(async () => {
			await disconnectFakeParticipants();
			await Promise.all([deleteAllRooms(), deleteAllRecordings()]);
			context = null;
		});

		it('should return an empty list of recordings when none exist', async () => {
			const response = await getAllRecordings();
			expect(response.status).toBe(200);
			expectSuccessListRecordingResponse(response, 0, false, false);
		});

		it('should return a list of recordings', async () => {
			context = await setupMultiRecordingsTestContext(1, 1, 1);
			({ room } = context.getRoomByIndex(0)!);
			const response = await getAllRecordings();
			expectSuccessListRecordingResponse(response, 1, false, false);
		});

		it('should return a list of recordings belonging to the room when using recording token', async () => {
			// Create a room and start a recording
			let roomData = await setupSingleRoomWithRecording(true);
			const roomId = roomData.room.roomId;

			// Generate a recording token for the room
			const roomMemberToken = await generateRoomMemberToken(roomId, { secret: roomData.speakerSecret });

			// Create a new room and start a recording
			roomData = await setupSingleRoomWithRecording(true);

			const response = await getAllRecordingsFromRoom(roomMemberToken);
			expectSuccessListRecordingResponse(response, 1, false, false);
			expect(response.body.recordings[0].roomId).toBe(roomId);
		});

		it('should filter recordings by roomId', async () => {
			context = await setupMultiRecordingsTestContext(2, 2, 2);
			({ room } = context.getRoomByIndex(0)!);
			const response = await getAllRecordings({ roomId: room.roomId });
			expectSuccessListRecordingResponse(response, 1, false, false);
			expect(response.body.recordings[0].roomId).toBe(room.roomId);
		});

		it('should return recordings with fields filter applied', async () => {
			context = await setupMultiRecordingsTestContext(2, 2, 2);
			({ room } = context.getRoomByIndex(0)!);
			const response = await getAllRecordings({ fields: 'roomId,recordingId' });
			expectSuccessListRecordingResponse(response, 2, false, false);

			context.rooms.forEach((roomData: RoomData) => {
				const room = roomData.room;
				const recording = response.body.recordings.find(
					(recording: MeetRecordingInfo) => recording.roomId === room.roomId
				);
				expect(recording).toBeDefined();
				expectValidRecordingWithFields(recording, ['roomId', 'recordingId']);
				expect(recording).toHaveProperty('roomId', room.roomId);
				expect(recording.recordingId).toContain(room.roomId);
			});
		});

		it('should return recordings with pagination', async () => {
			context = await setupMultiRecordingsTestContext(6, 6, 6);
			const rooms = context.rooms;
			const response = await getAllRecordings({ maxItems: 3 });
			expectSuccessListRecordingResponse(response, 3, true, true, 3);

			response.body.recordings.forEach((recording: MeetRecordingInfo) => {
				const associatedRoom = rooms.find((r) => r.room.roomId === recording.roomId);
				expect(associatedRoom).toBeDefined();
				expectValidRecording(
					recording,
					associatedRoom!.recordingId!,
					associatedRoom!.room.roomId,
					associatedRoom!.room.roomName,
					MeetRecordingStatus.COMPLETE
				);
			});

			const nextPageToken = response.body.pagination.nextPageToken;
			const nextResponse = await getAllRecordings({ maxItems: 3, nextPageToken });

			expectSuccessListRecordingResponse(nextResponse, 3, false, false, 3);
			nextResponse.body.recordings.forEach((recording: MeetRecordingInfo) => {
				const associatedRoom = rooms.find((r) => r.room.roomId === recording.roomId);

				expectValidRecording(
					recording,
					associatedRoom!.recordingId!,
					associatedRoom!.room.roomId,
					associatedRoom!.room.roomName,
					MeetRecordingStatus.COMPLETE
				);
			});
		});

		it('should cap maxItems to the maximum allowed (100)', async () => {
			context = await setupMultiRecordingsTestContext(1, 1, 1);
			const response = await getAllRecordings({ maxItems: 101 });
			expectSuccessListRecordingResponse(response, 1, false, false, 100);
		});

		it('should coerce a floating point number to integer for maxItems', async () => {
			context = await setupMultiRecordingsTestContext(1, 1, 1);
			const response = await getAllRecordings({ maxItems: 3.5 });
			expectSuccessListRecordingResponse(response, 1, false, false, 3);
		});
	});

	describe('List Recordings Validation', () => {
		it('should fail when maxItems is not a number', async () => {
			const response = await getAllRecordings({ maxItems: 'not-a-number' });
			expectValidationError(response, 'maxItems', 'Expected number');
		});

		it('should fail when maxItems is negative', async () => {
			const response = await getAllRecordings({ maxItems: -5 });
			expectValidationError(response, 'maxItems', 'must be a positive number');
		});

		it('should fail when maxItems is zero', async () => {
			const response = await getAllRecordings({ maxItems: 0 });
			expectValidationError(response, 'maxItems', 'must be a positive number');
		});

		it('should fail when fields is not a string', async () => {
			const response = await getAllRecordings({ fields: { invalid: 'object' } });
			expectValidationError(response, 'fields', 'Expected string');
		});
	});
});
