import { StringValue } from 'ms';
import { MeetRoomHelper } from '../../src/helpers';
import { MeetRoom } from '../../src/typings/ce';
import { expectValidStartRecordingResponse } from './assertion-helpers';
import {
	createRoom,
	generateParticipantToken,
	joinFakeParticipant,
	sleep,
	startRecording,
	stopRecording
} from './request-helpers';

export interface RoomData {
	room: MeetRoom;
	moderatorSecret: string;
	moderatorCookie: string;
	publisherSecret: string;
	publisherCookie: string;
	recordingId?: string;
}

export interface TestContext {
	rooms: RoomData[];
	getRoomByIndex(index: number): RoomData | undefined;
	getLastRoom(): RoomData | undefined;
}

/**
 * Creates a single room with optional participant.
 *
 * @param withParticipant Whether to join a fake participant in the room.
 * @returns               Room data including secrets and cookies.
 */
export const setupSingleRoom = async (withParticipant = false): Promise<RoomData> => {
	const room = await createRoom({
		roomIdPrefix: 'TEST_ROOM'
	});

	// Extract the room secrets and generate participant tokens, saved as cookies
	const { moderatorSecret, publisherSecret } = MeetRoomHelper.extractSecretsFromRoom(room);
	const [moderatorCookie, publisherCookie] = await Promise.all([
		generateParticipantToken(room.roomId, 'MODERATOR', moderatorSecret),
		generateParticipantToken(room.roomId, 'PUBLISHER', publisherSecret),
		// Join participant if needed
		withParticipant ? joinFakeParticipant(room.roomId, 'TEST_PARTICIPANT') : Promise.resolve()
	]);

	return {
		room,
		moderatorSecret,
		moderatorCookie,
		publisherSecret,
		publisherCookie
	};
};

/**
 * Creates a test context with multiple rooms and optional participants.
 *
 * @param numRooms         Number of rooms to create.
 * @param withParticipants Whether to join fake participants in the rooms.
 * @returns                Test context with created rooms and their data.
 */
export const setupMultiRoomTestContext = async (numRooms: number, withParticipants: boolean): Promise<TestContext> => {
	const rooms: RoomData[] = [];

	for (let i = 0; i < numRooms; i++) {
		const roomData = await setupSingleRoom(withParticipants);
		rooms.push(roomData);
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
};

/**
 * Quickly creates multiple recordings
 * Allows customizing how many recordings to start and how many to stop after a delay.
 *
 * @param numRooms  Number of rooms to use.
 * @param numStarts Number of recordings to start.
 * @param numStops  Number of recordings to stop after the delay.
 * @param stopDelay Delay before stopping recordings.
 * @returns         Test context with created recordings (some stopped, some still running).
 */
export const setupMultiRecordingsTestContext = async (
	numRooms: number,
	numStarts: number,
	numStops: number,
	stopDelay?: StringValue
): Promise<TestContext> => {
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
	if (stopDelay) {
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
};
