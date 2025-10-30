import { afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import { MeetAnalytics } from '@openvidu-meet/typings';
import {
	createRoom,
	deleteAllRecordings,
	deleteAllRooms,
	disconnectFakeParticipants,
	getAnalytics,
	startTestServer,
	stopRecording
} from '../../../helpers/request-helpers.js';
import { setupSingleRoom, setupSingleRoomWithRecording } from '../../../helpers/test-scenarios.js';

describe('Analytics API Tests', () => {
	beforeAll(async () => {
		await startTestServer();
	});

	afterEach(async () => {
		await disconnectFakeParticipants();
		await Promise.all([deleteAllRooms(), deleteAllRecordings()]);
	});

	describe('Get analytics', () => {
		it('should return correct structure', async () => {
			const response = await getAnalytics();

			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty('totalRooms');
			expect(response.body).toHaveProperty('activeRooms');
			expect(response.body).toHaveProperty('totalRecordings');
			expect(response.body).toHaveProperty('completeRecordings');

			// All properties should be numbers
			expect(typeof response.body.totalRooms).toBe('number');
			expect(typeof response.body.activeRooms).toBe('number');
			expect(typeof response.body.totalRecordings).toBe('number');
			expect(typeof response.body.completeRecordings).toBe('number');
		});

		it('should return zero analytics when no data exists', async () => {
			const response = await getAnalytics();
			expect(response.status).toBe(200);

			const analytics: MeetAnalytics = response.body;
			expect(analytics.totalRooms).toBe(0);
			expect(analytics.activeRooms).toBe(0);
			expect(analytics.totalRecordings).toBe(0);
			expect(analytics.completeRecordings).toBe(0);
		});

		it('should count total rooms correctly', async () => {
			// Create 3 rooms
			await createRoom();
			await createRoom();
			await createRoom();

			const response = await getAnalytics();
			expect(response.status).toBe(200);

			const analytics: MeetAnalytics = response.body;
			expect(analytics.totalRooms).toBe(3);
			expect(analytics.activeRooms).toBe(0);
		});

		it('should count active rooms correctly', async () => {
			// Create 3 rooms, 2 with active meetings
			await createRoom();
			await setupSingleRoom(true);
			await setupSingleRoom(true);

			const response = await getAnalytics();
			expect(response.status).toBe(200);

			const analytics: MeetAnalytics = response.body;
			expect(analytics.totalRooms).toBe(3);
			expect(analytics.activeRooms).toBe(2);
		});

		it('should count recordings correctly', async () => {
			// Create 2 recordings, only 1 complete
			await setupSingleRoomWithRecording(true);
			const roomToStop = await setupSingleRoomWithRecording(false);

			const response = await getAnalytics();
			expect(response.status).toBe(200);

			const analytics: MeetAnalytics = response.body;
			expect(analytics.totalRecordings).toBe(2);
			expect(analytics.completeRecordings).toBe(1);

			// Now stop the incomplete recording
			await stopRecording(roomToStop.recordingId!, roomToStop.moderatorToken);
		});
	});
});
