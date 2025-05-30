import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { container } from '../../../../src/config/index.js';
import { RecordingService } from '../../../../src/services';
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
	getRecording,
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
import { setInternalConfig } from '../../../../src/config/internal-config.js';
import { SystemEventType } from '../../../../src/models/system-event.model.js';

describe('Recording API Race Conditions Tests', () => {
	let context: TestContext | null = null;
	let recordingService: RecordingService;

	beforeAll(async () => {
		startTestServer();
		recordingService = container.get(RecordingService);
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

	it('should handle recording rejection when start recording fails', async () => {
		context = await setupMultiRoomTestContext(1, true);
		const roomData = context.getRoomByIndex(0)!;
		const startRoomCompositeSpy = jest
			.spyOn(recordingService['livekitService'], 'startRoomComposite')
			.mockImplementation(async () => {
				throw new Error('Failed to start room composite');
			});
		const eventServiceOffSpy = jest.spyOn(recordingService['systemEventService'], 'off');
		const handleRecordingLockTimeoutSpy = jest.spyOn(recordingService as any, 'handleRecordingLockTimeout');
		const releaseLockSpy = jest.spyOn(recordingService as any, 'releaseRecordingLockIfNoEgress');

		try {
			// Attempt to start recording
			const result = await startRecording(roomData.room.roomId, roomData.moderatorCookie);
			expect(eventServiceOffSpy).toHaveBeenCalledWith(SystemEventType.RECORDING_ACTIVE, expect.any(Function));
			expect(handleRecordingLockTimeoutSpy).not.toHaveBeenCalledWith(
				'', // empty recordingId since it never started
				roomData.room.roomId
			);
			expect(releaseLockSpy).toHaveBeenCalled();
			expect(startRoomCompositeSpy).toHaveBeenCalled();
			console.log('Recording start response:', result.body);
			expect(result.status).toBe(500); // Service Unavailable due to failure
		} finally {
			// Cleanup
			startRoomCompositeSpy.mockRestore();
			handleRecordingLockTimeoutSpy.mockRestore();
			releaseLockSpy.mockRestore();
			eventServiceOffSpy.mockRestore();
		}
	});

	it('should properly release recording lock when timeout occurs before startRoomComposite completes', async () => {
		setInternalConfig({
			RECORDING_STARTED_TIMEOUT: '1s' // Set a short timeout for testing
		});
		context = await setupMultiRoomTestContext(1, true);
		const roomData = context.getRoomByIndex(0)!;

		// Mock the startRoomComposite method to simulate a delay
		// const originalStartRoomComposite = recordingService['livekitService'].startRoomComposite;
		const startRoomCompositeSpy = jest
			.spyOn(recordingService['livekitService'], 'startRoomComposite')
			.mockImplementation(async (...args) => {
				await sleep('6s'); // Longer than 3s timeout
				throw new Error('Request failed with status 503: Service Unavailable');
			});

		// Mock the handleRecordingLockTimeout method to prevent actual timeout handling
		const handleTimeoutSpy = jest.spyOn(recordingService as any, 'handleRecordingLockTimeout');
		// Mock the releaseRecordingLockIfNoEgress method to prevent actual lock release
		const releaseLockSpy = jest.spyOn(recordingService as any, 'releaseRecordingLockIfNoEgress');
		const eventServiceOffSpy = jest.spyOn(recordingService['systemEventService'], 'off');

		try {
			// Start recording with a short timeout
			const result = await startRecording(roomData.room.roomId, roomData.moderatorCookie);

			expect(eventServiceOffSpy).toHaveBeenCalledWith(SystemEventType.RECORDING_ACTIVE, expect.any(Function));
			// Expect the recording to fail due to timeout
			expect(handleTimeoutSpy).toHaveBeenCalledWith(
				'', // empty recordingId since it never started
				roomData.room.roomId
			);
			expect(releaseLockSpy).toHaveBeenCalled();
			expect(startRoomCompositeSpy).toHaveBeenCalled();

			console.log('Recording start response:', result.body);
			expect(result.body.message).toContain('timed out while starting');
			expect(result.status).toBe(503); // Service Unavailable due to timeout
		} finally {
			// Cleanup
			startRoomCompositeSpy.mockRestore();
			handleTimeoutSpy.mockRestore();
			releaseLockSpy.mockRestore();
			eventServiceOffSpy.mockRestore();
			setInternalConfig({
				RECORDING_STARTED_TIMEOUT: '20s' // Reset to default value
			});
		}
	});

	it('should maintain system stability when timeout occurs during recording start', async () => {
		setInternalConfig({
			RECORDING_STARTED_TIMEOUT: '5s'
		});
		context = await setupMultiRoomTestContext(2, true);
		const room1 = context.getRoomByIndex(0)!;
		const room2 = context.getRoomByIndex(1)!;

		// Mock startRoomComposite for room1 to timeout
		const originalStartRoomComposite = recordingService['livekitService'].startRoomComposite;
		let callCount = 0;
		const startRoomCompositeSpy = jest
			.spyOn(recordingService['livekitService'], 'startRoomComposite')
			.mockImplementation(async (...args) => {
				callCount++;

				if (callCount === 1) {
					// First call (room1) - timeout
					await sleep('5s');
					return originalStartRoomComposite.apply(recordingService['livekitService'], args);
				} else {
					// Subsequent calls - work normally
					return originalStartRoomComposite.apply(recordingService['livekitService'], args);
				}
			});

		try {
			// Start recording in room1 (should timeout)
			const result1 = await startRecording(room1.room.roomId, room1.moderatorCookie);
			expect(result1.status).toBe(503);

			// ✅ EXPECTED BEHAVIOR: System should remain stable
			// Recording in different room should work normally
			const result2 = await startRecording(room2.room.roomId, room2.moderatorCookie);
			expect(result2.status).toBe(201);
			expectValidStartRecordingResponse(result2, room2.room.roomId);

			// ✅ EXPECTED BEHAVIOR: After timeout cleanup, room1 should be available again
			const result3 = await startRecording(room1.room.roomId, room1.moderatorCookie);
			expect(result3.status).toBe(201);
			expectValidStartRecordingResponse(result3, room1.room.roomId);
		} finally {
			startRoomCompositeSpy.mockRestore();
			setInternalConfig({
				RECORDING_STARTED_TIMEOUT: '20s' // Reset to default value
			});
		}
	});

	it('should handle concurrent timeout scenarios in multiple rooms', async () => {
		setInternalConfig({
			RECORDING_STARTED_TIMEOUT: '2s'
		});
		context = await setupMultiRoomTestContext(3, true);
		const rooms = [0, 1, 2].map((i) => context!.getRoomByIndex(i)!);

		// Mock startRoomComposite to timeout for all rooms
		const startRoomCompositeSpy = jest
			.spyOn(recordingService['livekitService'], 'startRoomComposite')
			.mockImplementation(async () => {
				await sleep('5s');
				throw new Error('Should timeout before this');
			});

		try {
			// Start recordings in all rooms simultaneously (all should timeout)
			const results = await Promise.all(
				rooms.map((room) => startRecording(room.room.roomId, room.moderatorCookie))
			);

			// All should timeout
			results.forEach((result) => {
				expect(result.status).toBe(503);
			});

			startRoomCompositeSpy.mockRestore();
			setInternalConfig({
				RECORDING_STARTED_TIMEOUT: '6s'
			});

			// ✅ EXPECTED BEHAVIOR: After timeouts, all rooms should be available again
			const retryResults = await Promise.all(
				rooms.map((room) => startRecording(room.room.roomId, room.moderatorCookie))
			);

			retryResults.forEach((result, index) => {
				expect(result.status).toBe(201);
				expectValidStartRecordingResponse(result, rooms[index].room.roomId);
			});
		} finally {
			startRoomCompositeSpy.mockRestore();
			setInternalConfig({
				RECORDING_STARTED_TIMEOUT: '20s' // Reset to default value
			});
		}
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
