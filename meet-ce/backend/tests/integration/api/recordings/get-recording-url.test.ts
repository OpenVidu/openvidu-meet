import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { Express } from 'express';
import request from 'supertest';
import { INTERNAL_CONFIG } from '../../../../src/config/internal-config.js';
import { errorRecordingNotFound } from '../../../../src/models/error.model.js';
import { expectValidGetRecordingUrlResponse } from '../../../helpers/assertion-helpers.js';
import { disconnectFakeParticipants } from '../../../helpers/livekit-cli-helpers.js';
import {
	deleteAllRecordings,
	deleteAllRooms,
	endMeeting,
	getFullPath,
	getRecordingUrl,
	loginRootAdmin,
	startTestServer,
	updateRoomAccessConfig
} from '../../../helpers/request-helpers.js';

import { setupSingleRoomWithRecording } from '../../../helpers/test-scenarios.js';

describe('Recording API Tests', () => {
	let app: Express;
	let roomId: string;
	let recordingId: string;

	beforeAll(async () => {
		app = await startTestServer();
		await deleteAllRecordings();

		const roomData = await setupSingleRoomWithRecording(true);
		roomId = roomData.room.roomId;
		recordingId = roomData.recordingId!;

		// End the meeting in order to allow changing room access config
		await disconnectFakeParticipants();
		await endMeeting(roomId, roomData.moderatorToken);
	});

	afterAll(async () => {
		await deleteAllRooms();
		await deleteAllRecordings();
	});

	describe('Get Recording URL Tests', () => {
		const RECORDINGS_PATH = getFullPath(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/recordings`);

		it('should get public recording URL when anonymous recording access is enabled', async () => {
			// Enable anonymous recording access for the room
			await updateRoomAccessConfig(roomId, {
				anonymous: {
					recording: {
						enabled: true
					}
				}
			});

			// Get the recording URL with public access
			const response = await getRecordingUrl(recordingId);
			expectValidGetRecordingUrlResponse(response, recordingId);

			// Parse the URL to extract the secret from the query parameters
			const parsedUrl = new URL(response.body.url);
			const secret = parsedUrl.searchParams.get('recordingSecret');

			// Verify that the URL is publicly accessible
			const recordingResponse = await request(app)
				.get(`${RECORDINGS_PATH}/${recordingId}/media`)
				.query({ recordingSecret: secret });
			expect(recordingResponse.status).toBe(200);
		});

		it('should fail with a 403 error when generating a public URL and anonymous recording access is disabled', async () => {
			// Disable anonymous recording access for the room
			await updateRoomAccessConfig(roomId, {
				anonymous: {
					recording: {
						enabled: false
					}
				}
			});

			// Attempt to get the recording URL with public access
			const response = await getRecordingUrl(recordingId);
			expect(response.status).toBe(403);
			expect(response.body.message).toContain('Anonymous access in room');
			expect(response.body.message).toContain('is disabled for recordings');
		});

		it('should get private recording URL', async () => {
			// Enable anonymous recording access for the room
			await updateRoomAccessConfig(roomId, {
				anonymous: {
					recording: {
						enabled: true
					}
				}
			});

			// Get the recording URL with private access
			const response = await getRecordingUrl(recordingId, true);
			expectValidGetRecordingUrlResponse(response, recordingId);

			// Parse the URL to extract the secret from the query parameters
			const parsedUrl = new URL(response.body.url);
			const secret = parsedUrl.searchParams.get('recordingSecret');

			// Verify that the URL is not publicly accessible
			let recordingResponse = await request(app)
				.get(`${RECORDINGS_PATH}/${recordingId}/media`)
				.query({ recordingSecret: secret });
			expect(recordingResponse.status).toBe(401);

			// Verify that the URL is accessible with authentication
			const { accessToken } = await loginRootAdmin();
			recordingResponse = await request(app)
				.get(`${RECORDINGS_PATH}/${recordingId}/media`)
				.query({ recordingSecret: secret })
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, accessToken);
			expect(recordingResponse.status).toBe(200);
		});

		it('should get private recording URL when anonymous recording access is disabled', async () => {
			// Disable anonymous recording access for the room
			await updateRoomAccessConfig(roomId, {
				anonymous: {
					recording: {
						enabled: false
					}
				}
			});

			// Get the recording URL with private access
			const response = await getRecordingUrl(recordingId, true);
			expectValidGetRecordingUrlResponse(response, recordingId);

			// Parse the URL to extract the secret from the query parameters
			const parsedUrl = new URL(response.body.url);
			const secret = parsedUrl.searchParams.get('recordingSecret');

			// Verify that the URL is not publicly accessible
			let recordingResponse = await request(app)
				.get(`${RECORDINGS_PATH}/${recordingId}/media`)
				.query({ recordingSecret: secret });
			expect(recordingResponse.status).toBe(401);

			// Verify that the URL is accessible with authentication
			const { accessToken } = await loginRootAdmin();
			recordingResponse = await request(app)
				.get(`${RECORDINGS_PATH}/${recordingId}/media`)
				.query({ recordingSecret: secret })
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, accessToken);
			expect(recordingResponse.status).toBe(200);
		});

		it('should fail with a 404 error when the recording does not exist', async () => {
			const nonExistentRecordingId = 'nonexistent--EG_222--4s444';
			const response = await getRecordingUrl(nonExistentRecordingId);
			expect(response.status).toBe(404);
			expect(response.body.message).toBe(errorRecordingNotFound(nonExistentRecordingId).message);
		});
	});
});
