import { MeetRoomHelper } from '../../src/helpers';
import {
	createRoom,
	generateParticipantToken,
	joinFakeParticipant,
	loginUserAsRole,
	sleep,
	startRecording,
	stopRecording
} from './request-helpers';

import ms, { StringValue } from 'ms';
import { MeetRoom, UserRole } from '../../src/typings/ce';
import { expectValidStartRecordingResponse } from './assertion-helpers';

export interface RoomData {
	room: MeetRoom;
	moderatorCookie: string;
	moderatorSecret: string;
	recordingId?: string;
}

export interface TestContext {
	rooms: RoomData[];
	getRoomByIndex(index: number): RoomData | undefined;
	getLastRoom(): RoomData | undefined;
}

/**
 * Configura un escenario de prueba con dos salas para pruebas de grabación concurrente
 */
export async function setupMultiRoomTestContext(numRooms: number, withParticipants: boolean): Promise<TestContext> {
	const adminCookie = await loginUserAsRole(UserRole.ADMIN);
	const rooms: RoomData[] = [];

	// Create additional rooms
	for (let i = 0; i < numRooms; i++) {
		const room = await createRoom({
			roomIdPrefix: `test-recording-room-${i + 1}`
		});
		const { moderatorSecret } = MeetRoomHelper.extractSecretsFromRoom(room);
		const [moderatorCookie, _] = await Promise.all([
			generateParticipantToken(adminCookie, room.roomId, `Moderator-${i + 1}`, moderatorSecret),
			// Join participant (if needed) concurrently with token generation
			withParticipants ? joinFakeParticipant(room.roomId, `TEST_P-${i + 1}`) : Promise.resolve()
		]);

		rooms.push({
			room,
			moderatorCookie,
			moderatorSecret
		});
	}

	return {
		rooms,
		getRoomByIndex: (index: number) => {
			if (index < 0 || index >= rooms.length) {
				return undefined;
			}

			return rooms[index];
		},

		getLastRoom: () => {
			if (rooms.length === 0) {
				return undefined;
			}

			return rooms[rooms.length - 1];
		}
	};
}

/**
 * Quickly creates multiple recordings for bulk delete testing.
 * Allows customizing how many recordings to start and how many to stop after a delay.
 *
 * @param numRooms    Number of rooms to use.
 * @param numStarts   Number of recordings to start.
 * @param numStops    Number of recordings to stop after the delay.
 * @param stopDelayMs Delay in milliseconds before stopping recordings.
 * @returns           Test context with created recordings (some stopped, some still running).
 */
export async function setupMultiRecordingsTestContext(
	numRooms: number,
	numStarts: number,
	numStops: number,
	stopDelay: StringValue
): Promise<TestContext> {
	// Setup rooms with participants
	const testContext = await setupMultiRoomTestContext(numRooms, true);

	// Start the specified number of recordings in parallel
	const startPromises = Array.from({ length: numStarts }).map(async (_, i) => {
		const roomIndex = i % numRooms;
		const roomData = testContext.getRoomByIndex(roomIndex);

		if (!roomData) {
			throw new Error(`Room at index ${roomIndex} not found`);
		}

		// Send start recording request
		const response = await startRecording(roomData.room.roomId, roomData.moderatorCookie);
		expectValidStartRecordingResponse(response, roomData.room.roomId);

		// Store the recordingId in context
		roomData.recordingId = response.body.recordingId;
		return roomData;
	});
	const startedRooms = await Promise.all(startPromises);

	// Wait for the configured delay before stopping recordings
	if (ms(stopDelay) > 0) {
		await sleep(stopDelay);
	}

	// Stop recordings for the first numStops rooms
	const stopPromises = startedRooms.slice(0, numStops).map(async (roomData) => {
		if (roomData.recordingId) {
			await stopRecording(roomData.recordingId, roomData.moderatorCookie);
			console.log(`Recording stopped for room ${roomData.room.roomId}`);
			return roomData.recordingId;
		}

		return null;
	});
	const stoppedIds = (await Promise.all(stopPromises)).filter((id): id is string => Boolean(id));
	console.log(`Stopped ${stoppedIds.length} recordings after ${stopDelay}ms:`, stoppedIds);

	return testContext;
}
