import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { errorRecordingNotFound } from '../../../../src/models/error.model.js';
import { MeetRecordingStatus, MeetRoom } from '../../../../src/typings/ce/index.js';
import { expectValidationError, expectValidGetRecordingResponse } from '../../../helpers/assertion-helpers.js';
import {
	deleteAllRecordings,
	deleteAllRooms,
	disconnectFakeParticipants,
	getRecording,
	startTestServer,
	stopAllRecordings
} from '../../../helpers/request-helpers.js';
import { setupMultiRecordingsTestContext, TestContext } from '../../../helpers/test-scenarios.js';

describe('Recording API Tests', () => {
	let context: TestContext | null = null;
	let room: MeetRoom, moderatorCookie: string, recordingId: string;

	beforeAll(async () => {
		startTestServer();
		// Create a room and join a participant
		context = await setupMultiRecordingsTestContext(1, 1, 1);
		({ room, moderatorCookie, recordingId = '' } = context.getRoomByIndex(0)!);
	});

	afterAll(async () => {
		await stopAllRecordings(moderatorCookie);
		await disconnectFakeParticipants();
		await deleteAllRooms();
		await deleteAllRecordings();
		context = null;
	});

	describe('Get Recording Tests', () => {
		it('should return 200 when recording exists', async () => {
			const response = await getRecording(recordingId);

			expectValidGetRecordingResponse(response, recordingId, room.roomId, MeetRecordingStatus.COMPLETE, 1);
		});

		it('should get an ACTIVE recording status', async () => {
			const contextAux = await setupMultiRecordingsTestContext(1, 1, 0);
			const {
				room: roomAux,
				recordingId: recordingIdAux = '',
				moderatorCookie: moderatorCookieAux
			} = contextAux.getRoomByIndex(0)!;
			const response = await getRecording(recordingIdAux);

			expectValidGetRecordingResponse(response, recordingIdAux, roomAux.roomId, MeetRecordingStatus.ACTIVE);

			await stopAllRecordings(moderatorCookieAux);
		});

		it('should return 404 when recording does not exist', async () => {
			const response = await getRecording('nonexistent--EG_222--4s444');
			expect(response.status).toBe(404);
			expect(response.body.message).toBe(errorRecordingNotFound('nonexistent--EG_222--4s444').message);
		});
	});

	describe('Get Recording Validation', () => {
		it('should fail when recordingId has incorrect format', async () => {
			const response = await getRecording('incorrect-format');
			expectValidationError(response, 'recordingId', 'does not follow the expected format');
		});

		it('should fail when recordingId has less than 3 parts', async () => {
			const response = await getRecording('part1--part2');
			expectValidationError(response, 'recordingId', 'does not follow the expected format');
		});

		it('should fail when recordingId first part is empty', async () => {
			const response = await getRecording('--EG_12345--uid');
			expectValidationError(response, 'recordingId', 'does not follow the expected format');
		});

		it('should fail when recordingId second part does not start with EG_', async () => {
			const response = await getRecording(`${room.roomId}--INVALID--uid`);
			expectValidationError(response, 'recordingId', 'does not follow the expected format');
		});

		it('should fail when recordingId second part is too short', async () => {
			const response = await getRecording(`${room.roomId}--EG_--uid`);
			expectValidationError(response, 'recordingId', 'does not follow the expected format');
		});

		it('should fail when recordingId third part is empty', async () => {
			const response = await getRecording(`${room.roomId}--EG_12345--`);
			expectValidationError(response, 'recordingId', 'does not follow the expected format');
		});

		it('should sanitize recordingId before validation', async () => {
			const response = await getRecording(` ${recordingId} `);
			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty('recordingId', recordingId);
		});
	});
});
