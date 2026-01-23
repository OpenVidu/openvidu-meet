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
	startTestServer,
	stopRecording
} from '../../../helpers/request-helpers.js';
import { setupMultiRecordingsTestContext, setupSingleRoomWithRecording } from '../../../helpers/test-scenarios.js';
import { RoomData, TestContext } from '../../../interfaces/scenarios.js';

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

		it('should return a list of recordings belonging to the room when using room member token', async () => {
			// Create a room and start a recording
			let roomData = await setupSingleRoomWithRecording(true);
			const roomId = roomData.room.roomId;

			// Generate a room member token for the room
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

		it('should filter recordings by status', async () => {
			// Create recordings with different statuses
			const [roomData] = await Promise.all([
				setupSingleRoomWithRecording(false), // Active
				setupSingleRoomWithRecording(true) // Complete
			]);

			const response = await getAllRecordings({ status: MeetRecordingStatus.COMPLETE });
			expectSuccessListRecordingResponse(response, 1, false, false);

			const recordings = response.body.recordings;
			expect(recordings[0].status).toBe(MeetRecordingStatus.COMPLETE);

			// Stop the active recording to clean up
			await stopRecording(roomData.recordingId!, roomData.moderatorToken);
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

	describe('List Recordings Sorting', () => {
		let roomDataA: RoomData;
		let roomDataB: RoomData;
		let roomDataC: RoomData;

		beforeAll(async () => {
			// Create a single set of recordings that can be used by all sorting tests
			// Created sequentially to ensure known creation order for startDate sorting
			// With specific names for roomName sorting
			// With different durations for duration/size sorting
			roomDataA = await setupSingleRoomWithRecording(true, '1s', 'Room A');
			roomDataB = await setupSingleRoomWithRecording(true, '2s', 'Room B');
			roomDataC = await setupSingleRoomWithRecording(false, undefined, 'Room C');
		});

		afterAll(async () => {
			// Stop the active recording
			await stopRecording(roomDataC.recordingId!, roomDataC.moderatorToken);

			// Disconnect participants and clean up
			await disconnectFakeParticipants();
			await Promise.all([deleteAllRooms(), deleteAllRecordings()]);
		});

		it('should sort recordings by startDate ascending and descending', async () => {
			// Test ascending
			let response = await getAllRecordings({ sortField: 'startDate', sortOrder: 'asc' });
			let recordings = response.body.recordings;
			expectSuccessListRecordingResponse(response, 3, false, false);

			expect(recordings[0].recordingId).toBe(roomDataA.recordingId);
			expect(recordings[1].recordingId).toBe(roomDataB.recordingId);
			expect(recordings[2].recordingId).toBe(roomDataC.recordingId);

			// Test descending
			response = await getAllRecordings({ sortField: 'startDate', sortOrder: 'desc' });
			recordings = response.body.recordings;
			expectSuccessListRecordingResponse(response, 3, false, false);

			expect(recordings).toHaveLength(3);
			expect(recordings[0].recordingId).toBe(roomDataC.recordingId);
			expect(recordings[1].recordingId).toBe(roomDataB.recordingId);
			expect(recordings[2].recordingId).toBe(roomDataA.recordingId);
		});

		it('should sort recordings by roomName ascending and descending', async () => {
			// Test ascending
			let response = await getAllRecordings({ sortField: 'roomName', sortOrder: 'asc' });
			let recordings = response.body.recordings;
			expectSuccessListRecordingResponse(response, 3, false, false);

			expect(recordings).toHaveLength(3);
			expect(recordings[0].roomName).toBe(roomDataA.room.roomName);
			expect(recordings[1].roomName).toBe(roomDataB.room.roomName);
			expect(recordings[2].roomName).toBe(roomDataC.room.roomName);

			// Test descending
			response = await getAllRecordings({ sortField: 'roomName', sortOrder: 'desc' });
			recordings = response.body.recordings;
			expectSuccessListRecordingResponse(response, 3, false, false);

			expect(recordings).toHaveLength(3);
			expect(recordings[0].roomName).toBe(roomDataC.room.roomName);
			expect(recordings[1].roomName).toBe(roomDataB.room.roomName);
			expect(recordings[2].roomName).toBe(roomDataA.room.roomName);
		});

		it('should sort recordings by duration ascending and descending', async () => {
			// Test ascending
			let response = await getAllRecordings({ sortField: 'duration', sortOrder: 'asc' });
			let recordings = response.body.recordings;
			expectSuccessListRecordingResponse(response, 3, false, false);

			// The active recording has no duration, so it should appear first
			expect(recordings[0].recordingId).toBe(roomDataC.recordingId);
			expect(recordings[0].duration).toBeUndefined();

			// Then the completed recordings in ascending duration order
			expect(recordings[1].recordingId).toBe(roomDataA.recordingId);
			expect(recordings[2].recordingId).toBe(roomDataB.recordingId);

			// Test descending
			response = await getAllRecordings({ sortField: 'duration', sortOrder: 'desc' });
			recordings = response.body.recordings;
			expectSuccessListRecordingResponse(response, 3, false, false);

			// Completed recordings in descending duration order
			expect(recordings[0].recordingId).toBe(roomDataB.recordingId);
			expect(recordings[1].recordingId).toBe(roomDataA.recordingId);

			// The active recording has no duration, so it should appear last
			expect(recordings[2].recordingId).toBe(roomDataC.recordingId);
			expect(recordings[2].duration).toBeUndefined();
		});

		it('should sort recordings by size ascending and descending', async () => {
			// Test ascending
			let response = await getAllRecordings({ sortField: 'size', sortOrder: 'asc' });
			let recordings = response.body.recordings;
			expectSuccessListRecordingResponse(response, 3, false, false);

			// The active recording has no size, so it should appear first
			expect(recordings[0].recordingId).toBe(roomDataC.recordingId);
			expect(recordings[0].size).toBeUndefined();

			// Then the completed recordings in ascending size order
			expect(recordings[1].recordingId).toBe(roomDataA.recordingId);
			expect(recordings[2].recordingId).toBe(roomDataB.recordingId);

			// Test descending
			response = await getAllRecordings({ sortField: 'size', sortOrder: 'desc' });
			recordings = response.body.recordings;
			expectSuccessListRecordingResponse(response, 3, false, false);

			// Completed recordings in descending size order
			expect(recordings[0].recordingId).toBe(roomDataB.recordingId);
			expect(recordings[1].recordingId).toBe(roomDataA.recordingId);

			// The active recording has no size, so it should appear last
			expect(recordings[2].recordingId).toBe(roomDataC.recordingId);
			expect(recordings[2].size).toBeUndefined();
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

		it('should fail when sortField is invalid', async () => {
			const response = await getAllRecordings({ sortField: 'invalidField' });
			expectValidationError(response, 'sortField', 'Invalid enum value');
		});

		it('should fail when sortOrder is invalid', async () => {
			const response = await getAllRecordings({ sortOrder: 'invalid' });
			expectValidationError(response, 'sortOrder', 'Invalid enum value');
		});

		it('should fail when status is invalid', async () => {
			const response = await getAllRecordings({ status: 'invalid_status' });
			expectValidationError(response, 'status', 'Invalid enum value');
		});
	});
});
