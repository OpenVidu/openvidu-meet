import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { Express } from 'express';
import request from 'supertest';
import { errorRecordingNotFound } from '../../../../src/models/error.model.js';
import {
	deleteAllRecordings,
	deleteAllRooms,
	disconnectFakeParticipants,
	getRecordingUrl,
	startTestServer
} from '../../../helpers/request-helpers.js';
import { setupSingleRoomWithRecording } from '../../../helpers/test-scenarios.js';
import { expectValidGetRecordingUrlResponse } from '../../../helpers/assertion-helpers.js';
import INTERNAL_CONFIG from '../../../../src/config/internal-config.js';

describe('Recording API Tests', () => {
	let app: Express;
	let recordingId: string;

	beforeAll(async () => {
		app = startTestServer();
		await deleteAllRecordings();

		const roomData = await setupSingleRoomWithRecording(true);
		recordingId = roomData.recordingId!;
	});

	afterAll(async () => {
		await disconnectFakeParticipants();
		await Promise.all([deleteAllRooms(), deleteAllRecordings()]);
	});

	describe('Get Recording URL Tests', () => {
		const RECORDINGS_PATH = `${INTERNAL_CONFIG.API_BASE_PATH_V1}/recordings`;

		it('should get public recording URL', async () => {
			const response = await getRecordingUrl(recordingId);
			expectValidGetRecordingUrlResponse(response, recordingId);

			// Parse the URL to extract the secret from the query parameters
			const parsedUrl = new URL(response.body.url);
			const secret = parsedUrl.searchParams.get('secret');

			// Verify that the URL is publicly accessible
			const recordingResponse = await request(app).get(
				`${RECORDINGS_PATH}/${recordingId}/media?secret=${secret}`
			);
			expect(recordingResponse.status).toBe(200);
		});

		it('should get private recording URL', async () => {
			const response = await getRecordingUrl(recordingId, true);
			expectValidGetRecordingUrlResponse(response, recordingId);

			// Parse the URL to extract the secret from the query parameters
			const parsedUrl = new URL(response.body.url);
			const secret = parsedUrl.searchParams.get('secret');

			// Verify that the URL is not publicly accessible
			const recordingResponse = await request(app).get(
				`${RECORDINGS_PATH}/${recordingId}/media?secret=${secret}`
			);
			expect(recordingResponse.status).toBe(401);
		});

		it('should fail with a 404 error when the recording does not exist', async () => {
			const nonExistentRecordingId = 'nonexistent--EG_222--4s444';
			const response = await getRecordingUrl(nonExistentRecordingId);
			expect(response.status).toBe(404);
			expect(response.body.message).toBe(errorRecordingNotFound(nonExistentRecordingId).message);
		});
	});
});
