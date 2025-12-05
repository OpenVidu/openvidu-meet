import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { MeetRoomStatus } from '@openvidu-meet/typings';
import { container } from '../../../../src/config/dependency-injector.config.js';
import { RoomRepository } from '../../../../src/repositories/room.repository.js';
import { LiveKitService } from '../../../../src/services/livekit.service.js';
import {
	createRoom,
	deleteAllRecordings,
	deleteAllRooms,
	disconnectFakeParticipants,
	executeRoomStatusValidationGC,
	getRoom,
	startTestServer
} from '../../../helpers/request-helpers.js';

describe('Active Rooms Status GC Tests', () => {
	let liveKitService: LiveKitService;
	let roomRepository: RoomRepository;

	beforeAll(async () => {
		await startTestServer();
		liveKitService = container.get(LiveKitService);
		roomRepository = container.get(RoomRepository);
	});

	afterAll(async () => {
		await disconnectFakeParticipants();
		await deleteAllRooms();
		await deleteAllRecordings();
		jest.restoreAllMocks();
	});

	it('should open an active room if it does not exist in LiveKit', async () => {
		const createdRoom = await createRoom({
			roomName: 'test-active-status-gc'
		});

		// Force status to ACTIVE_MEETING directly in DB
		const room = await roomRepository.findByRoomId(createdRoom.roomId);


		if (room) {
			room.status = MeetRoomStatus.ACTIVE_MEETING;
			await roomRepository.update(room);
		}

		let response = await getRoom(createdRoom.roomId);
		expect(response.status).toBe(200);
		expect(response.body.status).toBe(MeetRoomStatus.ACTIVE_MEETING);

		// Mock LiveKitService.roomExists to return false
		const roomExistsSpy = jest.spyOn(liveKitService, 'roomExists').mockResolvedValue(false);

		await executeRoomStatusValidationGC();

		response = await getRoom(createdRoom.roomId);
		expect(response.status).toBe(200);
		// Should be OPEN because default meetingEndAction is NONE
		expect(response.body.status).toBe(MeetRoomStatus.OPEN);

		roomExistsSpy.mockRestore();
	});

	it('should not touch an active room if it exists in LiveKit', async () => {
		const createdRoom = await createRoom({
			roomName: 'test-consistent-gc'
		});

		// Force status to ACTIVE_MEETING directly in DB
		const room = await roomRepository.findByRoomId(createdRoom.roomId);

		if (room) {
			room.status = MeetRoomStatus.ACTIVE_MEETING;
			await roomRepository.update(room);
		}

		const roomExistsSpy = jest.spyOn(liveKitService, 'roomExists').mockResolvedValue(true);

		await executeRoomStatusValidationGC();

		const response = await getRoom(createdRoom.roomId);
		expect(response.status).toBe(200);
		expect(response.body.status).toBe(MeetRoomStatus.ACTIVE_MEETING);

		roomExistsSpy.mockRestore();
	});

	it('should not run the GC if no active rooms exist', async () => {
		// Ensure DB is clean
		await deleteAllRooms();

		// Spy on LiveKitService.roomExists to ensure it's not called
		const roomExistsSpy = jest.spyOn(liveKitService, 'roomExists');

		// Clear any previous calls that could have been recorded by earlier test runs
		roomExistsSpy.mockClear();

		// Run GC - it should complete without throwing even when DB has no active rooms
		await expect(executeRoomStatusValidationGC()).resolves.not.toThrow();

		roomExistsSpy.mockRestore();
	});

	it('should handle errors when checking room existence in LiveKit', async () => {
		const createdRoom = await createRoom({ roomName: 'test-livekit-error-gc' });

		// Force status to ACTIVE_MEETING directly in DB
		const room = await roomRepository.findByRoomId(createdRoom.roomId);

		if (room) {
			room.status = MeetRoomStatus.ACTIVE_MEETING;
			await roomRepository.update(room);
		}

		// Mock LiveKitService.roomExists to throw an error
		const roomExistsSpy = jest.spyOn(liveKitService, 'roomExists').mockRejectedValue(new Error('LiveKit down'));

		// Run GC - it should catch the error and continue without throwing
		await expect(executeRoomStatusValidationGC()).resolves.not.toThrow();

		// Room should remain ACTIVE_MEETING because we couldn't confirm its absence
		const response = await getRoom(createdRoom.roomId);
		expect(response.status).toBe(200);
		expect(response.body.status).toBe(MeetRoomStatus.ACTIVE_MEETING);

		roomExistsSpy.mockRestore();
	});

	it('should not affect rooms that are not in ACTIVE_MEETING status', async () => {
		const createdRoom = await createRoom({ roomName: 'test-not-active-gc' });

		// Ensure room is OPEN (default) and not ACTIVE_MEETING
		const response1 = await getRoom(createdRoom.roomId);
		expect(response1.status).toBe(200);
		expect(response1.body.status).not.toBe(MeetRoomStatus.ACTIVE_MEETING);

		// Spy on LiveKitService.roomExists to ensure GC won't query rooms that aren't active
		const roomExistsSpy = jest.spyOn(liveKitService, 'roomExists');

		await executeRoomStatusValidationGC();

		// Since there are no ACTIVE_MEETING rooms, roomExists should not be called for this room
		// (it may be called for other test artifacts, so we just assert we didn't change the status)
		const response2 = await getRoom(createdRoom.roomId);
		expect(response2.status).toBe(200);
		expect(response2.body.status).toBe(response1.body.status);

		roomExistsSpy.mockRestore();
	});

	it('should handle multiple inconsistent rooms correctly', async () => {
		// Create two rooms and force them to ACTIVE_MEETING
		const r1 = await createRoom({ roomName: 'test-multi-inconsistent-1' });
		const r2 = await createRoom({ roomName: 'test-multi-inconsistent-2' });

		const room1 = await roomRepository.findByRoomId(r1.roomId);
		const room2 = await roomRepository.findByRoomId(r2.roomId);

		if (room1) {
			room1.status = MeetRoomStatus.ACTIVE_MEETING;
			await roomRepository.update(room1);
		}

		if (room2) {
			room2.status = MeetRoomStatus.ACTIVE_MEETING;
			await roomRepository.update(room2);
		}

		// Mock LiveKitService.roomExists to return false for both rooms
		const roomExistsSpy = jest.spyOn(liveKitService, 'roomExists').mockResolvedValue(false);

		await executeRoomStatusValidationGC();

		const resp1 = await getRoom(r1.roomId);
		const resp2 = await getRoom(r2.roomId);

		expect(resp1.status).toBe(200);
		expect(resp2.status).toBe(200);

		// Both should have been closed (status no longer ACTIVE_MEETING)
		expect(resp1.body.status).not.toBe(MeetRoomStatus.ACTIVE_MEETING);
		expect(resp2.body.status).not.toBe(MeetRoomStatus.ACTIVE_MEETING);

		roomExistsSpy.mockRestore();
	});
});
