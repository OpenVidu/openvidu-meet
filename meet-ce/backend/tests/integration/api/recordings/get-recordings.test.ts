import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { MeetRecordingInfo, MeetRecordingStatus } from '@openvidu-meet/typings';
import {
	expectSuccessListRecordingResponse,
	expectValidationError,
	expectValidRecording,
	expectValidRecordingWithFields
} from '../../../helpers/assertion-helpers.js';
import { disconnectFakeParticipants } from '../../../helpers/livekit-cli-helpers.js';
import {
	deleteAllRecordings,
	deleteAllRooms,
	generateRoomMemberToken,
	getAllRecordings,
	getAllRecordingsFromRoom,
	startTestServer,
	stopRecording
} from '../../../helpers/request-helpers.js';

import { setupSingleRoomWithRecording } from '../../../helpers/test-scenarios.js';
import { RoomData } from '../../../interfaces/scenarios.js';

describe('Recordings API Tests', () => {
	const removeRoomsAndRecordings = async () => {
		await disconnectFakeParticipants();
		await deleteAllRooms();
		await deleteAllRecordings();
	};

	const roomNamesOf = (recordings: MeetRecordingInfo[]) => recordings.map((recording) => recording.roomName).sort();

	beforeAll(async () => {
		await startTestServer();
		await removeRoomsAndRecordings();
	});

	it('should return an empty list of recordings when none exist', async () => {
		const response = await getAllRecordings();
		expectSuccessListRecordingResponse(response, 0, false, false);
	});

	describe('List Recordings Tests', () => {
		const ROOM_NAMES = ['Alpha Focus Room', 'Focus Room', 'Focus Room Extra', 'Other Room'];
		let rooms: RoomData[];
		let focusRoom: RoomData;
		let otherRoom: RoomData;

		const expectValidRecordingOfItsRoom = (recording: MeetRecordingInfo) => {
			const roomData = rooms.find(({ room }) => room.roomId === recording.roomId);
			expect(roomData).toBeDefined();
			expectValidRecording(
				recording,
				roomData!.recordingId!,
				roomData!.room.roomId,
				roomData!.room.roomName,
				MeetRecordingStatus.COMPLETE
			);
		};

		beforeAll(async () => {
			rooms = await Promise.all(
				ROOM_NAMES.map((roomName) => setupSingleRoomWithRecording(true, undefined, roomName))
			);
			[, focusRoom, , otherRoom] = rooms;
		});

		afterAll(removeRoomsAndRecordings);

		it('should return a list of recordings', async () => {
			const response = await getAllRecordings();
			expectSuccessListRecordingResponse(response, rooms.length, false, false);
		});

		it('should return a list of recordings belonging to the room when using room member token', async () => {
			const roomId = focusRoom.room.roomId;
			const roomMemberToken = await generateRoomMemberToken(roomId, { secret: focusRoom.speakerSecret });

			const response = await getAllRecordingsFromRoom(roomMemberToken);
			expectSuccessListRecordingResponse(response, 1, false, false);
			expect(response.body.recordings[0].roomId).toBe(roomId);
		});

		it('should filter recordings by roomId', async () => {
			const response = await getAllRecordings({ roomId: focusRoom.room.roomId });
			expectSuccessListRecordingResponse(response, 1, false, false);
			expect(response.body.recordings[0].roomId).toBe(focusRoom.room.roomId);
		});

		it('should prioritize roomId and ignore roomName when both filters are provided', async () => {
			const response = await getAllRecordings({ roomId: otherRoom.room.roomId, roomName: 'Focus Room' });
			expectSuccessListRecordingResponse(response, 1, false, false);
			expect(response.body.recordings[0].roomId).toBe(otherRoom.room.roomId);
			expect(response.body.recordings[0].roomName).toBe('Other Room');
		});

		it('should filter recordings by roomName using exact match by default', async () => {
			const response = await getAllRecordings({ roomName: 'Focus Room' });
			expectSuccessListRecordingResponse(response, 1, false, false);
			expect(response.body.recordings[0].roomName).toBe('Focus Room');
		});

		it('should filter recordings by roomName prefix match mode', async () => {
			const response = await getAllRecordings({ roomName: 'Focus', roomNameMatchMode: 'prefix' });
			expectSuccessListRecordingResponse(response, 2, false, false);
			expect(roomNamesOf(response.body.recordings)).toEqual(['Focus Room', 'Focus Room Extra']);
		});

		it('should filter recordings by roomName partial match mode', async () => {
			const response = await getAllRecordings({ roomName: 'Focus', roomNameMatchMode: 'partial' });
			expectSuccessListRecordingResponse(response, 3, false, false);
			expect(roomNamesOf(response.body.recordings)).toEqual([
				'Alpha Focus Room',
				'Focus Room',
				'Focus Room Extra'
			]);
		});

		it('should filter recordings by roomName regex match mode', async () => {
			const response = await getAllRecordings({
				roomName: '^Focus Room( Extra)?$',
				roomNameMatchMode: 'regex'
			});
			expectSuccessListRecordingResponse(response, 2, false, false);
			expect(roomNamesOf(response.body.recordings)).toEqual(['Focus Room', 'Focus Room Extra']);
		});

		it('should filter recordings by roomName using case-insensitive exact match', async () => {
			const response = await getAllRecordings({
				roomName: 'focus room',
				roomNameCaseInsensitive: true
			});
			expectSuccessListRecordingResponse(response, 1, false, false);
			expect(response.body.recordings[0].roomName).toBe('Focus Room');
		});

		it('should return recordings with fields filter applied', async () => {
			const response = await getAllRecordings({ fields: 'roomId,recordingId' });
			expectSuccessListRecordingResponse(response, rooms.length, false, false);

			rooms.forEach(({ room }) => {
				const recording = response.body.recordings.find(
					(recording: MeetRecordingInfo) => recording.roomId === room.roomId
				);
				expect(recording).toBeDefined();
				expectValidRecordingWithFields(recording, ['recordingId', 'roomId']);
				expect(recording.recordingId).toContain(room.roomId);
			});
		});

		it('should page through recordings when the requested fields leave out the sort field', async () => {
			const firstPage = await getAllRecordings({ maxItems: 2, fields: 'recordingId' });
			expectSuccessListRecordingResponse(firstPage, 2, true, true, 2);

			const secondPage = await getAllRecordings({
				maxItems: 2,
				fields: 'recordingId',
				nextPageToken: firstPage.body.pagination.nextPageToken
			});
			expectSuccessListRecordingResponse(secondPage, 2, false, false, 2);

			const recordings: MeetRecordingInfo[] = [...firstPage.body.recordings, ...secondPage.body.recordings];
			recordings.forEach((recording) => expectValidRecordingWithFields(recording, ['recordingId']));
			expect(recordings.map((recording) => recording.recordingId).sort()).toEqual(
				rooms.map((roomData) => roomData.recordingId).sort()
			);
		});

		it('should return recordings with pagination', async () => {
			const response = await getAllRecordings({ maxItems: 3 });
			expectSuccessListRecordingResponse(response, 3, true, true, 3);
			response.body.recordings.forEach(expectValidRecordingOfItsRoom);

			const nextPageToken = response.body.pagination.nextPageToken;
			const nextResponse = await getAllRecordings({ maxItems: 3, nextPageToken });
			expectSuccessListRecordingResponse(nextResponse, 1, false, false, 3);
			nextResponse.body.recordings.forEach(expectValidRecordingOfItsRoom);

			const recordingIds = [...response.body.recordings, ...nextResponse.body.recordings].map(
				(recording: MeetRecordingInfo) => recording.recordingId
			);
			expect(new Set(recordingIds).size).toBe(rooms.length);
		});

		it('should cap maxItems to the maximum allowed (100)', async () => {
			const response = await getAllRecordings({ maxItems: 101 });
			expectSuccessListRecordingResponse(response, rooms.length, false, false, 100);
		});

		it('should coerce a floating point number to integer for maxItems', async () => {
			const response = await getAllRecordings({ maxItems: 3.5 });
			expectSuccessListRecordingResponse(response, 3, true, true, 3);
		});

		describe('Fields filtering', () => {
			it('should filter fields using X-Fields header', async () => {
				const response = await getAllRecordings({}, { xFields: 'recordingId,roomId' });
				expectSuccessListRecordingResponse(response, rooms.length, false, false);

				response.body.recordings.forEach((recording: MeetRecordingInfo) => {
					expectValidRecordingWithFields(recording, ['recordingId', 'roomId']);
				});
			});

			it('should combine X-Fields header with fields query param (union)', async () => {
				// Query param requests 'recordingId', header requests 'roomName' → result should have both
				const response = await getAllRecordings({ fields: 'recordingId' }, { xFields: 'roomName' });
				expectSuccessListRecordingResponse(response, rooms.length, false, false);

				response.body.recordings.forEach((recording: MeetRecordingInfo) => {
					expectValidRecordingWithFields(recording, ['recordingId', 'roomName']);
				});
			});

			it('should deduplicate fields when same field is in both query param and header', async () => {
				const response = await getAllRecordings(
					{ fields: 'recordingId,roomId' },
					{ xFields: 'recordingId,status' }
				);
				expectSuccessListRecordingResponse(response, rooms.length, false, false);

				response.body.recordings.forEach((recording: MeetRecordingInfo) => {
					expectValidRecordingWithFields(recording, ['recordingId', 'roomId', 'status']);
				});
			});

			it('should work with only headers and no query params', async () => {
				const response = await getAllRecordings({}, { xFields: 'recordingId,status,roomId' });
				expectSuccessListRecordingResponse(response, rooms.length, false, false);

				response.body.recordings.forEach((recording: MeetRecordingInfo) => {
					expectValidRecordingWithFields(recording, ['recordingId', 'roomId', 'status']);
				});
			});

			it('should ignore invalid header values gracefully and fallback to query params', async () => {
				const response = await getAllRecordings({ fields: 'recordingId,roomId' }, { xFields: '' });
				expectSuccessListRecordingResponse(response, rooms.length, false, false);

				response.body.recordings.forEach((recording: MeetRecordingInfo) => {
					expectValidRecordingWithFields(recording, ['recordingId', 'roomId']);
				});
			});

			it('should ignore invalid field names in X-Fields header', async () => {
				const response = await getAllRecordings({}, { xFields: 'recordingId,invalidField,roomId' });
				expectSuccessListRecordingResponse(response, rooms.length, false, false);

				response.body.recordings.forEach((recording: MeetRecordingInfo) => {
					expectValidRecordingWithFields(recording, ['recordingId', 'roomId']);
					expect(recording).not.toHaveProperty('invalidField');
				});
			});
		});
	});

	describe('List Recordings Sorting and Status', () => {
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
			await stopRecording(roomDataC.recordingId!);
			await removeRoomsAndRecordings();
		});

		it('should filter recordings by status', async () => {
			const response = await getAllRecordings({ status: MeetRecordingStatus.COMPLETE });
			expectSuccessListRecordingResponse(response, 2, false, false);
			expect(roomNamesOf(response.body.recordings)).toEqual(['Room A', 'Room B']);
			response.body.recordings.forEach((recording: MeetRecordingInfo) =>
				expect(recording.status).toBe(MeetRecordingStatus.COMPLETE)
			);
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
		it('should fail when roomNameMatchMode is invalid', async () => {
			const response = await getAllRecordings({ roomName: 'Focus Room', roomNameMatchMode: 'invalid' });
			expectValidationError(response, 'roomNameMatchMode', 'Invalid enum value');
		});

		it('should fail when roomNameCaseInsensitive is not a boolean', async () => {
			const response = await getAllRecordings({ roomNameCaseInsensitive: 'not-a-boolean' });
			expectValidationError(response, 'roomNameCaseInsensitive', 'Expected boolean, received string');
		});

		it('should fail when roomName regex pattern is invalid', async () => {
			const response = await getAllRecordings({ roomName: '[invalid-regex', roomNameMatchMode: 'regex' });
			expectValidationError(response, 'roomName', 'Invalid regular expression pattern');
		});

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
