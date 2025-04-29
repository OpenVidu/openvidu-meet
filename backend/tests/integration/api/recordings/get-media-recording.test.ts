import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { expectSuccessRecordingMediaResponse, expectValidationError } from '../../../utils/assertion-helpers';
import {
	deleteAllRecordings,
	deleteAllRooms,
	getRecordingMedia,
	startTestServer,
	stopAllRecordings,
	stopRecording
} from '../../../utils/helpers';
import { setupMultiRecordingsTestContext } from '../../../utils/test-scenarios';
import { MeetRoom } from '../../../../src/typings/ce';

describe('Recording API Tests', () => {
	let room: MeetRoom, recordingId: string, moderatorCookie: string;

	beforeAll(async () => {
		startTestServer();

		const testContext = await setupMultiRecordingsTestContext(1, 1, 1, '3s');
		const roomData = testContext.getRoomByIndex(0)!;

		({ room, recordingId = '', moderatorCookie } = roomData);
	});

	afterAll(async () => {
		await stopAllRecordings(moderatorCookie);
		await Promise.all([deleteAllRecordings(), deleteAllRooms()]);
	});
	describe('Recording Media Tests', () => {
		it('should return 200 when requesting the full media content', async () => {
			const response = await getRecordingMedia(recordingId);

			console.log('Recording media response:', response.body);
			expectSuccessRecordingMediaResponse(response);
		});

		it('should return 206 when requesting partial media content', async () => {
			const fullResponse = await getRecordingMedia(recordingId);
			const fullSize = parseInt(fullResponse.headers['content-length']);

			// Request first 10000 bytes
			const range = 'bytes=0-9999';
			const response = await getRecordingMedia(recordingId, range);
			expectSuccessRecordingMediaResponse(response, range, fullSize);
		});

		it('should handle requests for specific byte ranges', async () => {
			// Get full recording size
			const fullResponse = await getRecordingMedia(recordingId);
			const fullSize = parseInt(fullResponse.headers['content-length']);

			// Request a 1000 byte segment from the middle
			const middleStart = Math.floor(fullSize / 2);
			const middleEnd = middleStart + 999;
			const range = `bytes=${middleStart}-${middleEnd}`;

			const response = await getRecordingMedia(recordingId, range);
			expectSuccessRecordingMediaResponse(response, range, fullSize);
		});

		it('should handle end-only ranges correctly', async () => {
			// Request last 2000 bytes
			const fullResponse = await getRecordingMedia(recordingId);
			const fullSize = parseInt(fullResponse.headers['content-length']);

			const start = fullSize - 2000;
			const range = `bytes=${start}-`;

			const response = await getRecordingMedia(recordingId, range);
			expectSuccessRecordingMediaResponse(response, range, fullSize);
		});
	});

	describe('Edge Cases and Robustness Tests', () => {
		it('should handle very large range requests gracefully', async () => {
			// Get full size
			const fullResponse = await getRecordingMedia(recordingId);
			const fullSize = parseInt(fullResponse.headers['content-length']);

			// Request more data than available
			const range = `bytes=0-${fullSize * 2}`;
			const response = await getRecordingMedia(recordingId, range);

			// Should still return data but adjust the range
			expectSuccessRecordingMediaResponse(response, range, fullSize, {
				ignoreRangeFormat: true,
				expectedStatus: 206
			});
		});

		it('should sanitize recordingId with spaces', async () => {
			// Adding spaces before and after the recordingId
			const spacedId = `  ${recordingId}  `;
			const response = await getRecordingMedia(spacedId);

			expectSuccessRecordingMediaResponse(response);
		});

		it('should handle multiple range requests to the same recording', async () => {
			// Make 3 consecutive range requests to ensure stability
			const rangeSize = 1000;

			for (let i = 0; i < 3; i++) {
				const start = i * rangeSize;
				const end = start + rangeSize - 1;
				const range = `bytes=${start}-${end}`;

				const fullResponse = await getRecordingMedia(recordingId);
				const fullSize = parseInt(fullResponse.headers['content-length']);
				const response = await getRecordingMedia(recordingId, range);

				expectSuccessRecordingMediaResponse(response, range, fullSize);
			}
		});

		it('should handle boundary ranges properly', async () => {
			// Get full size
			const fullResponse = await getRecordingMedia(recordingId);
			const fullSize = parseInt(fullResponse.headers['content-length']);

			// Test extreme ranges at the boundaries
			const testCases = [
				{ range: 'bytes=0-0', description: 'First byte only' },
				{ range: `bytes=${fullSize - 1}-${fullSize - 1}`, description: 'Last byte only' },
				{ range: `bytes=0-${Math.floor(fullSize / 3)}`, description: 'First third' },
				{ range: `bytes=${Math.floor((fullSize * 2) / 3)}-${fullSize - 1}`, description: 'Last third' }
			];

			for (const testCase of testCases) {
				const response = await getRecordingMedia(recordingId, testCase.range);
				expectSuccessRecordingMediaResponse(response, testCase.range, fullSize, {
					allowSizeDifference: true
				});
			}
		});
	});

	describe('Recording Media Validation', () => {
		it('shoud return a 422 when the range header has invalid format', async () => {
			const response = await getRecordingMedia(recordingId, 'bytes=100');

			expectValidationError(response, 'headers.range', 'Invalid range header format. Expected: bytes=start-end');
		});

		it('should return 422 when the range format is completely wrong', async () => {
			const response = await getRecordingMedia(recordingId, 'invalid-range');

			expectValidationError(response, 'headers.range', 'Invalid range header format. Expected: bytes=start-end');
		});

		it('should return a 416 when range is not satisfiable', async () => {
			// Get full size
			const fullResponse = await getRecordingMedia(recordingId);
			const fullSize = parseInt(fullResponse.headers['content-length']);

			// Request a range beyond the file size
			const response = await getRecordingMedia(recordingId, `bytes=${fullSize + 1}-${fullSize + 1000}`);
			expect(response.status).toBe(416);
			expect(response.body).toHaveProperty('name', 'Recording Error');
			expect(response.body).toHaveProperty('message');
			expect(response.body.message).toContain(`Recording '${recordingId}' range not satisfiable`);
			expect(response.body.message).toMatch(/File size: \d+/);
		});

		it('should return a 409 when the recording is in progress', async () => {
			const testContext = await setupMultiRecordingsTestContext(1, 1, 0, '0s');
			const { recordingId: activeRecordingId = '', moderatorCookie } = testContext.rooms[0];

			// Attempt to get the media of an active recording
			const response = await getRecordingMedia(activeRecordingId);
			expect(response.status).toBe(409);
			expect(response.body).toHaveProperty('name', 'Recording Error');
			expect(response.body).toHaveProperty('message');
			expect(response.body.message).toContain(`Recording '${activeRecordingId}' is not stopped yet`);

			await stopRecording(activeRecordingId, moderatorCookie);
		});

		it('should return 404 when recording not found', async () => {
			const nonExistentId = `${room.roomId}--EG_nonexistent--12345`;
			const response = await getRecordingMedia(nonExistentId);

			expect(response.status).toBe(404);
		});

		it('should return 400 when recordingId format is invalid', async () => {
			const invalidId = 'invalid-recording-id';
			const response = await getRecordingMedia(invalidId);

			expect(response.status).toBe(422);
			expectValidationError(response, 'params.recordingId', 'does not follow the expected format');
		});
	});
});
