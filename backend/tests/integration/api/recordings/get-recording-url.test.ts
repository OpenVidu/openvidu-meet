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

describe('Recording API Tests', () => {
	let app: Express;
	let recordingId: string;

	beforeAll(async () => {
		app = startTestServer();

		const roomData = await setupSingleRoomWithRecording(true);
		recordingId = roomData.recordingId!;
	});

	afterAll(async () => {
		await disconnectFakeParticipants();
		await deleteAllRooms();
		await deleteAllRecordings();
	});

	describe('Get Recording URL Tests', () => {
		it('should get public recording URL', async () => {
			const response = await getRecordingUrl(recordingId);
			expect(response.status).toBe(200);
			const recordingUrl = response.body.url;
			expect(recordingUrl).toBeDefined();

			// Verify that the URL is publicly accessible
			const publicResponse = await request(app).get(recordingUrl);
			expect(publicResponse.status).toBe(200);
		});

		it('should get private recording URL', async () => {
			const response = await getRecordingUrl(recordingId, true);
			expect(response.status).toBe(200);
			const recordingUrl = response.body.url;
			expect(recordingUrl).toBeDefined();

            // Verify that the URL is not publicly accessible
            const publicResponse = await request(app).get(recordingUrl);
            expect(publicResponse.status).toBe(401);
		});

		it('should fail with a 404 error when the recording does not exist', async () => {
			const nonExistentRecordingId = 'nonexistent--EG_222--4s444';
			const response = await getRecordingUrl(nonExistentRecordingId);
			expect(response.status).toBe(404);
			expect(response.body.message).toBe(errorRecordingNotFound(nonExistentRecordingId).message);
		});
	});
});
