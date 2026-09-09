import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { MeetRecordingStatus } from '@openvidu-meet/typings';
import { container } from '../../../../src/config/dependency-injector.config.js';
import { RecordingScheduledTasksService } from '../../../../src/services/recording-scheduled-tasks.service.js';
import { RecordingService } from '../../../../src/services/recording.service.js';
import {
	expectValidStartRecordingResponse,
	expectValidStopRecordingResponse
} from '../../../helpers/assertion-helpers.js';
import { disconnectFakeParticipants } from '../../../helpers/livekit-cli-helpers.js';
import {
	bulkDeleteRecordings,
	deleteAllRecordings,
	deleteAllRooms,
	deleteRecording,
	getRecording,
	getRecordingMedia,
	startRecording,
	startRecordingAndWaitUntilActive,
	startTestServer,
	stopAllRecordings,
	stopRecording
} from '../../../helpers/request-helpers.js';

import { setupMultiRecordingsTestContext, setupMultiRoomTestContext } from '../../../helpers/test-scenarios.js';
import { TestContext } from '../../../interfaces/scenarios.js';

describe('Recording API Race Conditions Tests', () => {
	let context: TestContext | null = null;
	let recordingService: RecordingService;

	beforeAll(async () => {
		await startTestServer();
		recordingService = container.get(RecordingService);

		await deleteAllRecordings();
	});

	afterEach(async () => {
		await disconnectFakeParticipants();
		await stopAllRecordings();

		await deleteAllRooms();
		await deleteAllRecordings();
		jest.restoreAllMocks();
	});

	it('should release the recording lock when LiveKit refuses to start the egress', async () => {
		context = await setupMultiRoomTestContext(1, true);
		const roomData = context.getRoomByIndex(0)!;
		const startRoomCompositeSpy = jest
			.spyOn(recordingService['livekitService'], 'startRoomComposite')
			.mockImplementation(async () => {
				throw new Error('Failed to start room composite');
			});
		const releaseLockSpy = jest.spyOn(recordingService, 'releaseRecordingLockIfNoEgress');

		const result = await startRecording(roomData.room.roomId);

		expect(startRoomCompositeSpy).toHaveBeenCalledTimes(1);
		expect(releaseLockSpy).toHaveBeenCalledWith(roomData.room.roomId);
		expect(result.status).toBe(500);
		expect(result.body.error).toContain('Internal Server Error');
	});

	it('should leave the room available again after a start that LiveKit refused', async () => {
		context = await setupMultiRoomTestContext(2, true);
		const room1 = context.getRoomByIndex(0)!;
		const room2 = context.getRoomByIndex(1)!;

		const originalStartRoomComposite = recordingService['livekitService'].startRoomComposite;
		const startRoomCompositeSpy = jest
			.spyOn(recordingService['livekitService'], 'startRoomComposite')
			.mockImplementationOnce(async () => {
				throw new Error('Request failed with status 503: Service Unavailable');
			})
			.mockImplementation((...args) =>
				originalStartRoomComposite.apply(recordingService['livekitService'], args)
			);

		const rec1 = await startRecording(room1.room.roomId);
		expect(rec1.status).toBe(500);

		// Other rooms are unaffected
		const rec2 = await startRecordingAndWaitUntilActive(room2.room.roomId);
		expectValidStartRecordingResponse(rec2, room2.room.roomId, room2.room.roomName);
		let response = await stopRecording(rec2.body.recordingId!);
		expectValidStopRecordingResponse(response, rec2.body.recordingId!, room2.room.roomId, room2.room.roomName);

		// The refused room accepts a new start right away
		const rec3 = await startRecordingAndWaitUntilActive(room1.room.roomId);
		expectValidStartRecordingResponse(rec3, room1.room.roomId, room1.room.roomName);
		response = await stopRecording(rec3.body.recordingId!);
		expectValidStopRecordingResponse(response, rec3.body.recordingId!, room1.room.roomId, room1.room.roomName);
		expect(startRoomCompositeSpy).toHaveBeenCalledTimes(3);
	});

	it('should handle concurrent refused starts in multiple rooms', async () => {
		context = await setupMultiRoomTestContext(3, true);
		const rooms = [0, 1, 2].map((i) => context!.getRoomByIndex(i)!);

		const startRoomCompositeSpy = jest
			.spyOn(recordingService['livekitService'], 'startRoomComposite')
			.mockImplementation(async () => {
				throw new Error('Failed to start room composite');
			});

		const results = await Promise.all(rooms.map((room) => startRecording(room.room.roomId)));
		results.forEach((result) => expect(result.status).toBe(500));

		startRoomCompositeSpy.mockRestore();

		const retryResults = await Promise.all(rooms.map((room) => startRecordingAndWaitUntilActive(room.room.roomId)));

		for (const startResult of retryResults) {
			const room = rooms.find((r) => r.room.roomId === startResult.body.roomId)!;
			expectValidStartRecordingResponse(startResult, room.room.roomId, room.room.roomName);
			const stopResult = await stopRecording(startResult.body.recordingId!);
			expectValidStopRecordingResponse(
				stopResult,
				startResult.body.recordingId!,
				room.room.roomId,
				room.room.roomName
			);
		}
	});

	it('should keep a recording waiting for its first track while another room stops its own', async () => {
		context = await setupMultiRoomTestContext(2, true);
		const roomDataA = context.getRoomByIndex(0)!;
		const roomDataB = context.getRoomByIndex(1)!;

		const recordingResponseA = await startRecording(roomDataA.room.roomId);
		expectValidStartRecordingResponse(recordingResponseA, roomDataA.room.roomId, roomDataA.room.roomName);
		const recordingIdA = recordingResponseA.body.recordingId;

		const recordingResponseB = await startRecordingAndWaitUntilActive(roomDataB.room.roomId);
		expectValidStartRecordingResponse(recordingResponseB, roomDataB.room.roomId, roomDataB.room.roomName);
		const recordingIdB = recordingResponseB.body.recordingId;

		const stopResponseB = await stopRecording(recordingIdB);
		expectValidStopRecordingResponse(stopResponseB, recordingIdB, roomDataB.room.roomId, roomDataB.room.roomName);

		const recordingA = await getRecording(recordingIdA);
		expect(recordingA.status).toBe(200);
		expect([MeetRecordingStatus.STARTING, MeetRecordingStatus.ACTIVE]).toContain(recordingA.body.status);

		const secondStartA = await startRecording(roomDataA.room.roomId);
		expect(secondStartA.status).toBe(409);
	});

	it('should handle simultaneous recordings in different rooms correctly', async () => {
		context = await setupMultiRoomTestContext(5, true);

		const roomDataList = Array.from({ length: 5 }, (_, index) => context!.getRoomByIndex(index)!);

		const startResponses = await Promise.all(
			roomDataList.map((roomData) => startRecordingAndWaitUntilActive(roomData.room.roomId))
		);

		startResponses.forEach((response, index) => {
			expectValidStartRecordingResponse(
				response,
				roomDataList[index].room.roomId,
				roomDataList[index].room.roomName
			);
		});

		const recordingIds = startResponses.map((res) => res.body.recordingId);

		const stopResponses = await Promise.all(recordingIds.map((recordingId) => stopRecording(recordingId)));

		stopResponses.forEach((response, index) => {
			expectValidStopRecordingResponse(
				response,
				recordingIds[index],
				roomDataList[index].room.roomId,
				roomDataList[index].room.roomName
			);
		});
	});

	it('should stop multiple recordings in parallel', async () => {
		context = await setupMultiRoomTestContext(2, true);
		const roomDataA = context.getRoomByIndex(0);
		const roomDataB = context.getRoomByIndex(1);
		const responseA = await startRecordingAndWaitUntilActive(roomDataA!.room.roomId);
		const responseB = await startRecordingAndWaitUntilActive(roomDataB!.room.roomId);
		const recordingIdA = responseA.body.recordingId;
		const recordingIdB = responseB.body.recordingId;

		const [stopResponseA, stopResponseB] = await Promise.all([
			stopRecording(recordingIdA),
			stopRecording(recordingIdB)
		]);
		expectValidStopRecordingResponse(stopResponseA, recordingIdA, roomDataA!.room.roomId, roomDataA!.room.roomName);
		expectValidStopRecordingResponse(stopResponseB, recordingIdB, roomDataB!.room.roomId, roomDataB!.room.roomName);
	});

	it('should prevent multiple recording starts in the same room', async () => {
		context = await setupMultiRoomTestContext(1, true);
		const roomData = context.getRoomByIndex(0)!;

		const [firstRecordingResponse, secondRecordingResponse] = await Promise.all([
			startRecording(roomData.room.roomId),
			startRecording(roomData.room.roomId)
		]);

		const statuses = [firstRecordingResponse.status, secondRecordingResponse.status].sort();
		expect(statuses).toEqual([201, 409]);

		const accepted = firstRecordingResponse.status === 201 ? firstRecordingResponse : secondRecordingResponse;
		expectValidStartRecordingResponse(accepted, roomData.room.roomId, roomData.room.roomName);
	});

	it('should handle race condition between stopping recording and garbage collection', async () => {
		context = await setupMultiRoomTestContext(1, true);
		const roomData = context.getRoomByIndex(0)!;

		const recordingTaskScheduler = container.get(RecordingScheduledTasksService);
		const gcSpy = jest.spyOn(recordingTaskScheduler as any, 'performActiveRecordingLocksGC');

		const startResponse = await startRecordingAndWaitUntilActive(roomData.room.roomId);
		expectValidStartRecordingResponse(startResponse, roomData.room.roomId, roomData.room.roomName);
		const recordingId = startResponse.body.recordingId;

		// Execute garbage collection while stopping the recording
		const stopPromise = stopRecording(recordingId);
		const gcPromise = recordingTaskScheduler['performActiveRecordingLocksGC']();

		// Both operations should complete

		await Promise.all([stopPromise, gcPromise]);

		// Check that the recording was stopped successfully
		const stopResponse = await stopPromise;
		expectValidStopRecordingResponse(stopResponse, recordingId, roomData.room.roomId, roomData.room.roomName);

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

		const deleteSuccessful = deleteResponse.status === 'fulfilled' && deleteResponse.value.status === 200;

		console.log(`Stream successful: ${streamSuccessful}, Delete successful: ${deleteSuccessful}`);

		if (deleteSuccessful) {
			// If delete was successful, verify that a new streaming request fails
			// This ensures the recording was actually deleted
			const verificationStreamResponse = await getRecordingMedia(recordingId);
			expect(verificationStreamResponse.status).not.toEqual(200);
			expect(verificationStreamResponse.status).not.toEqual(206);
		}

		if (streamSuccessful && deleteSuccessful) {
			// Both operations succeeded - this is possible if streaming started first
			// and had an open connection when delete happened
			// The system should still be in a consistent state where the recording is gone

			console.log('Both operations succeeded - checking system consistency');

			// Verify the recording doesn't exist in storage anymore
			const verificationRecordingResponse = await getRecording(recordingId);
			expect(verificationRecordingResponse.status).toBe(404);
		}

		expect(streamSuccessful || deleteSuccessful).toBe(true);
	});

	it('should handle race condition between bulk delete and recording start', async () => {
		context = await setupMultiRoomTestContext(3, true);

		// Start recordings in the first two rooms
		const room1 = context.getRoomByIndex(0)!;
		const room2 = context.getRoomByIndex(1)!;
		const room3 = context.getRoomByIndex(2)!;

		const start1 = await startRecordingAndWaitUntilActive(room1.room.roomId);
		const start2 = await startRecordingAndWaitUntilActive(room2.room.roomId);

		const recordingId1 = start1.body.recordingId;
		const recordingId2 = start2.body.recordingId;

		await stopRecording(recordingId1);
		await stopRecording(recordingId2);

		// Bulk delete the recordings while starting a new one
		const bulkDeletePromise = bulkDeleteRecordings([recordingId1, recordingId2]);
		const startNewRecordingPromise = startRecordingAndWaitUntilActive(room3.room.roomId);

		// Both operations should complete successfully
		const [bulkDeleteResult, newRecordingResult] = await Promise.all([bulkDeletePromise, startNewRecordingPromise]);

		expect(bulkDeleteResult.status).toBe(200);

		// Check that the new recording started successfully
		expectValidStartRecordingResponse(newRecordingResult, room3.room.roomId, room3.room.roomName);

		const newStopResponse = await stopRecording(newRecordingResult.body.recordingId);
		expectValidStopRecordingResponse(
			newStopResponse,
			newRecordingResult.body.recordingId,
			room3.room.roomId,
			room3.room.roomName
		);
	});
});
