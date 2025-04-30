import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { container } from '../../../../src/config/index.js';
import { RecordingService, TaskSchedulerService } from '../../../../src/services';
import {
	expectValidStartRecordingResponse,
	expectValidStopRecordingResponse
} from '../../../helpers/assertion-helpers';
import { eventController } from '../../../helpers/event-controller';
import {
	bulkDeleteRecordings,
	deleteAllRecordings,
	deleteAllRooms,
	deleteRecording,
	getRecordingMedia,
	sleep,
	startRecording,
	startTestServer,
	stopAllRecordings,
	stopRecording
} from '../../../helpers/request-helpers';
import {
	setupMultiRecordingsTestContext,
	setupMultiRoomTestContext,
	TestContext
} from '../../../helpers/test-scenarios';

describe('Recording API Race Conditions Tests', () => {
	let context: TestContext | null = null;
	let recordingService: RecordingService;
	let taskSchedulerService: TaskSchedulerService;

	beforeAll(async () => {
		startTestServer();
		recordingService = container.get(RecordingService);
		taskSchedulerService = container.get(TaskSchedulerService);
	});

	afterEach(async () => {
		const moderatorCookie = context?.getRoomByIndex(0)?.moderatorCookie;

		if (moderatorCookie) {
			await stopAllRecordings(moderatorCookie);
		}

		eventController.reset();
		await Promise.all([deleteAllRecordings(), deleteAllRooms()]);
		jest.clearAllMocks();
	});

	it('should start recordings concurrently in two rooms and stop one before RECORDING_ACTIVE is received for the other', async () => {
		context = await setupMultiRoomTestContext(2, true);
		const roomDataA = context.getRoomByIndex(0);
		const roomDataB = context.getRoomByIndex(1);

		eventController.initialize();
		eventController.pauseEventsForRoom(roomDataA!.room.roomId);

		const recordingPromiseA = startRecording(roomDataA!.room.roomId, roomDataA!.moderatorCookie);

		// Brief delay to ensure both recordings start in the right order
		await sleep('1s');

		// Step 2: Start recording in roomB (this will complete quickly)
		const recordingResponseB = await startRecording(roomDataB!.room.roomId, roomDataB!.moderatorCookie);
		expectValidStartRecordingResponse(recordingResponseB, roomDataB!.room.roomId);
		const recordingIdB = recordingResponseB.body.recordingId;

		// Step 3: Stop recording in roomB while roomA is still waiting for its event
		const stopResponseB = await stopRecording(recordingIdB, roomDataB!.moderatorCookie);
		expectValidStopRecordingResponse(stopResponseB, recordingIdB, roomDataB!.room.roomId);

		eventController.releaseEventsForRoom(roomDataA!.room.roomId);

		const recordingResponseA = (await Promise.race([
			recordingPromiseA,
			new Promise((_, reject) => setTimeout(() => reject(new Error('Recording A timed out')), 10000))
		])) as Response;

		// If we get here, the recording in roomA completed despite roomB being stopped
		expect(recordingResponseA.status).toBe(201);
	});

	it('should handle simultaneous recordings in different rooms correctly', async () => {
		context = await setupMultiRoomTestContext(5, true);

		const roomDataList = Array.from({ length: 5 }, (_, index) => context!.getRoomByIndex(index)!);

		const startResponses = await Promise.all(
			roomDataList.map((roomData) => startRecording(roomData.room.roomId, roomData.moderatorCookie))
		);

		startResponses.forEach((response, index) => {
			expectValidStartRecordingResponse(response, roomDataList[index].room.roomId);
		});

		const recordingIds = startResponses.map((res) => res.body.recordingId);

		const stopResponses = await Promise.all(
			recordingIds.map((recordingId, index) => stopRecording(recordingId, roomDataList[index].moderatorCookie))
		);

		stopResponses.forEach((response, index) => {
			expectValidStopRecordingResponse(response, recordingIds[index], roomDataList[index].room.roomId);
		});
	});

	it('should stop multiple recordings in parallel', async () => {
		context = await setupMultiRoomTestContext(2, true);
		const roomDataA = context.getRoomByIndex(0);
		const roomDataB = context.getRoomByIndex(1);
		const responseA = await startRecording(roomDataA!.room.roomId, roomDataA!.moderatorCookie);
		const responseB = await startRecording(roomDataB!.room.roomId, roomDataB!.moderatorCookie);
		const recordingIdA = responseA.body.recordingId;
		const recordingIdB = responseB.body.recordingId;

		const [stopResponseA, stopResponseB] = await Promise.all([
			stopRecording(recordingIdA, roomDataA!.moderatorCookie),
			stopRecording(recordingIdB, roomDataB!.moderatorCookie)
		]);
		expectValidStopRecordingResponse(stopResponseA, recordingIdA, roomDataA!.room.roomId);
		expectValidStopRecordingResponse(stopResponseB, recordingIdB, roomDataB!.room.roomId);
	});

	it('should prevent multiple recording starts in the same room', async () => {
		context = await setupMultiRoomTestContext(1, true);
		const roomData = context.getRoomByIndex(0)!;

		const [firstRecordingResponse, secondRecordingResponse] = await Promise.all([
			startRecording(roomData.room.roomId, roomData.moderatorCookie),
			startRecording(roomData.room.roomId, roomData.moderatorCookie)
		]);

		console.log('First recording response:', firstRecordingResponse.body);
		console.log('Second recording response:', secondRecordingResponse.body);

		// One of the recordings responses should be successful and the other should fail
		const oneShouldBeSuccessful = firstRecordingResponse.status === 201 || secondRecordingResponse.status === 201;
		const oneShouldBeFailed = firstRecordingResponse.status === 409 || secondRecordingResponse.status === 409;
		expect(oneShouldBeSuccessful).toBe(true);
		expect(oneShouldBeFailed).toBe(true);

		if (firstRecordingResponse.status === 201) {
			expectValidStartRecordingResponse(firstRecordingResponse, roomData.room.roomId);
		} else {
			expectValidStartRecordingResponse(secondRecordingResponse, roomData.room.roomId);
		}
	});

	it('should handle race condition between stopping recording and garbage collection', async () => {
		context = await setupMultiRoomTestContext(1, true);
		const roomData = context.getRoomByIndex(0)!;

		const gcSpy = jest.spyOn(recordingService as any, 'performRecordingLocksGarbageCollection');

		const startResponse = await startRecording(roomData.room.roomId, roomData.moderatorCookie);
		expectValidStartRecordingResponse(startResponse, roomData.room.roomId);
		const recordingId = startResponse.body.recordingId;

		// Execute garbage collection while stopping the recording
		const stopPromise = stopRecording(recordingId, roomData.moderatorCookie);
		const gcPromise = recordingService['performRecordingLocksGarbageCollection']();

		// Both operations should complete

		await Promise.all([stopPromise, gcPromise]);

		// Check that the recording was stopped successfully
		const stopResponse = await stopPromise;
		expectValidStopRecordingResponse(stopResponse, recordingId, roomData.room.roomId);

		// Check that garbage collection was called
		expect(gcSpy).toHaveBeenCalled();
	});

	it('should handle race condition between streaming and deleting recording', async () => {
		const testContext = await setupMultiRecordingsTestContext(1, 1, 1, '4s');
		const roomData = testContext.getRoomByIndex(0)!;
		const recordingId = roomData.recordingId!;

		// Start streaming and deleting the recording at the same time
		const streamPromise = getRecordingMedia(recordingId);
		const deletePromise = deleteRecording(recordingId);

		// Both operations should complete but one should fail
		const [streamResponse, deleteResponse] = await Promise.allSettled([streamPromise, deletePromise]);

		// One of the operations should be successful and the other should fail
		const streamSuccessful =
			streamResponse.status === 'fulfilled' &&
			(streamResponse.value.status === 200 || streamResponse.value.status === 206);

		const deleteSuccessful = deleteResponse.status === 'fulfilled' && deleteResponse.value.status === 204;

		expect(streamSuccessful || deleteSuccessful).toBe(true);

		// If both operations are successful, it means that the logic has a problem
		expect(streamSuccessful && deleteSuccessful).toBe(false);
	});

	it('should handle race condition between bulk delete and recording start', async () => {
		context = await setupMultiRoomTestContext(3, true);

		// Start recordings in the first two rooms
		const room1 = context.getRoomByIndex(0)!;
		const room2 = context.getRoomByIndex(1)!;
		const room3 = context.getRoomByIndex(2)!;

		const start1 = await startRecording(room1.room.roomId, room1.moderatorCookie);
		const start2 = await startRecording(room2.room.roomId, room2.moderatorCookie);

		const recordingId1 = start1.body.recordingId;
		const recordingId2 = start2.body.recordingId;

		await stopRecording(recordingId1, room1.moderatorCookie);
		await stopRecording(recordingId2, room2.moderatorCookie);

		// Bulk delete the recordings while starting a new one
		const bulkDeletePromise = bulkDeleteRecordings([recordingId1, recordingId2]);
		const startNewRecordingPromise = startRecording(room3.room.roomId, room3.moderatorCookie);

		// Both operations should complete successfully
		const [bulkDeleteResult, newRecordingResult] = await Promise.all([bulkDeletePromise, startNewRecordingPromise]);

		expect(bulkDeleteResult.status).toBe(204);
		expect(bulkDeleteResult.body).toEqual({});

		// Check that the new recording started successfully
		expectValidStartRecordingResponse(newRecordingResult, room3.room.roomId);

		const newStopResponse = await stopRecording(newRecordingResult.body.recordingId, room3.moderatorCookie);
		expectValidStopRecordingResponse(newStopResponse, newRecordingResult.body.recordingId, room3.room.roomId);
	});
});
