import { MeetRoom, MeetRoomConfig } from '@openvidu-meet/typings';
import express, { Request, Response } from 'express';
import http from 'http';
import { StringValue } from 'ms';
import { MeetRoomHelper } from '../../src/helpers/room.helper';
import { expectValidStartRecordingResponse } from './assertion-helpers';
import {
	createRoom,
	generateRoomMemberToken,
	joinFakeParticipant,
	sleep,
	startRecording,
	stopRecording
} from './request-helpers';

let mockWebhookServer: http.Server;

export interface RoomData {
	room: MeetRoom;
	moderatorSecret: string;
	moderatorToken: string;
	speakerSecret: string;
	speakerToken: string;
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
 * @param roomName        Name of the room to create.
 * @param config     Optional room config.
 * @returns               Room data including secrets and tokens.
 */
export const setupSingleRoom = async (
	withParticipant = false,
	roomName = 'TEST_ROOM',
	config?: Partial<MeetRoomConfig>
): Promise<RoomData> => {
	const room = await createRoom({
		roomName,
		config
	});

	// Extract the room secrets and generate room member tokens
	const { moderatorSecret, speakerSecret } = MeetRoomHelper.extractSecretsFromRoom(room);
	const [moderatorToken, speakerToken] = await Promise.all([
		generateRoomMemberToken(room.roomId, { secret: moderatorSecret, grantJoinMeetingPermission: false }),
		generateRoomMemberToken(room.roomId, { secret: speakerSecret, grantJoinMeetingPermission: false })
	]);

	// Join participant if needed
	if (withParticipant) {
		await joinFakeParticipant(room.roomId, 'TEST_PARTICIPANT');
	}

	return {
		room,
		moderatorSecret,
		moderatorToken,
		speakerSecret,
		speakerToken
	};
};

/**
 * Creates a test context with multiple rooms and optional participants.
 *
 * @param numRooms         Number of rooms to create.
 * @param withParticipants Whether to join fake participants in the rooms.
 * @returns                Test context with created rooms and their data.
 */
export const setupMultiRoomTestContext = async (
	numRooms: number,
	withParticipants: boolean,
	roomConfig?: Partial<MeetRoomConfig>
): Promise<TestContext> => {
	const rooms: RoomData[] = [];

	for (let i = 0; i < numRooms; i++) {
		const roomData = await setupSingleRoom(withParticipants, 'TEST_ROOM', roomConfig);
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

export const setupSingleRoomWithRecording = async (
	stopRecordingCond = false,
	stopDelay?: StringValue
): Promise<RoomData> => {
	const roomData = await setupSingleRoom(true, 'TEST_ROOM');
	const response = await startRecording(roomData.room.roomId, roomData.moderatorToken);
	expectValidStartRecordingResponse(response, roomData.room.roomId, roomData.room.roomName);
	roomData.recordingId = response.body.recordingId;

	// Wait for the configured delay before stopping the recording
	if (stopRecordingCond && stopDelay) {
		await sleep(stopDelay);
	}

	if (stopRecordingCond) {
		await stopRecording(roomData.recordingId!, roomData.moderatorToken);
	}

	return roomData;
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
		const response = await startRecording(roomData.room.roomId, roomData.moderatorToken);
		expectValidStartRecordingResponse(response, roomData.room.roomId, roomData.room.roomName);

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
			await stopRecording(roomData.recordingId, roomData.moderatorToken);
			console.log(`Recording stopped for room ${roomData.room.roomId}`);
			return roomData.recordingId;
		}

		return null;
	});
	const stoppedIds = (await Promise.all(stopPromises)).filter((id): id is string => Boolean(id));
	console.log(`Stopped ${stoppedIds.length} recordings after ${stopDelay}ms:`, stoppedIds);

	return testContext;
};

export const startWebhookServer = async (
	port: number,
	webhookReceivedCallback: (event: Request) => void
): Promise<void> => {
	const app = express();
	app.use(express.json());

	app.post('/webhook', (req: Request, res: Response) => {
		webhookReceivedCallback(req);
		res.status(200).send({ success: true });
	});

	return new Promise<void>((resolve) => {
		mockWebhookServer = app.listen(port, () => {
			console.log(`Webhook server listening on port ${port}`);
			resolve();
		});
	});
};

export const stopWebhookServer = async (): Promise<void> => {
	if (mockWebhookServer) {
		await new Promise<void>((resolve) => {
			mockWebhookServer.close(() => resolve());
		});
	}
};
