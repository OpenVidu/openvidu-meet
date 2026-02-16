import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import {
	expectValidRecordingLocationHeader,
	expectValidRecordingWithFields
} from '../../../helpers/assertion-helpers.js';
import {
	deleteAllRecordings,
	deleteAllRooms,
	disconnectFakeParticipants,
	startTestServer,
	stopRecording
} from '../../../helpers/request-helpers.js';
import { setupSingleRoomWithRecording } from '../../../helpers/test-scenarios.js';
import { TestContext } from '../../../interfaces/scenarios.js';

/**
 * Tests for X-Fields header and fields query parameter support across all recording operations.
 *
 * All recording operations (POST start, POST stop, GET all, GET one) support:
 * - `fields` query parameter for filtering response fields
 * - `X-Fields` header for filtering response fields
 * When both are provided, values are merged (union of unique fields).
 */
describe('Recording Header Fields Tests', () => {
	let context: TestContext | null = null;

	beforeAll(async () => {
		await startTestServer();
	});

	afterAll(async () => {
		await disconnectFakeParticipants();
		await Promise.all([deleteAllRooms(), deleteAllRecordings()]);
		context = null;
	});







	describe('POST /recordings/:recordingId/stop - X-Fields header and fields query param', () => {
		afterAll(async () => {
			await disconnectFakeParticipants();
			await Promise.all([deleteAllRooms(), deleteAllRecordings()]);
		});

		it('should filter response fields using X-Fields header on stop recording', async () => {
			const roomData = await setupSingleRoomWithRecording(false);
			const recId = roomData.recordingId!;

			const response = await stopRecording(recId, {
				headers: { xFields: 'recordingId,status' }
			});

			expect(response.status).toBe(202);
			expectValidRecordingLocationHeader(response);
			expectValidRecordingWithFields(response.body, ['recordingId', 'status']);
		});
	});
});
