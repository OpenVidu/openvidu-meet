import { afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import {
	MeetAnalytics,
	MeetRecordingEncodingPreset,
	MeetRecordingLayout,
	MeetRecordingStatus,
	MeetRoomStatus
} from '@openvidu-meet/typings';
import ms from 'ms';
import { container } from '../../../../src/config/dependency-injector.config.js';
import { MeetRoomModel } from '../../../../src/models/mongoose-schemas/room.schema.js';
import { RecordingRepository } from '../../../../src/repositories/recording.repository.js';
import { disconnectFakeParticipants } from '../../../helpers/livekit-cli-helpers.js';
import {
	createRoom,
	deleteAllRecordings,
	deleteAllRooms,
	getAnalytics,
	startTestServer,
	stopRecording,
	updateRoomStatus
} from '../../../helpers/request-helpers.js';
import { setupSingleRoom, setupSingleRoomWithRecording } from '../../../helpers/test-scenarios.js';

describe('Analytics API Tests', () => {
	beforeAll(async () => {
		await startTestServer();
	});

	afterEach(async () => {
		await disconnectFakeParticipants();
		await deleteAllRooms();
		await deleteAllRecordings();
	});

	describe('Get analytics', () => {
		it('should return correct structure', async () => {
			const response = await getAnalytics();

			expect(response.status).toBe(200);
			const counts = [
				'totalRooms',
				'activeRooms',
				'openRooms',
				'closedRooms',
				'totalRecordings',
				'completeRecordings',
				'recordingsInProgress',
				'roomsExpiringSoon'
			];

			for (const count of counts) {
				expect(response.body).toHaveProperty(count);
				expect(typeof response.body[count]).toBe('number');
			}
		});

		it('should return zero analytics when no data exists', async () => {
			const response = await getAnalytics();
			expect(response.status).toBe(200);

			const analytics: MeetAnalytics = response.body;
			expect(analytics.totalRooms).toBe(0);
			expect(analytics.activeRooms).toBe(0);
			expect(analytics.totalRecordings).toBe(0);
			expect(analytics.completeRecordings).toBe(0);
			expect(analytics.openRooms).toBe(0);
			expect(analytics.closedRooms).toBe(0);
			expect(analytics.recordingsInProgress).toBe(0);
			expect(analytics.roomsExpiringSoon).toBe(0);
			expect(analytics).not.toHaveProperty('nextExpiringRoom');
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
			expect(analytics.recordingsInProgress).toBe(1);

			// Now stop the incomplete recording
			await stopRecording(roomToStop.recordingId!);
		});

		it('should count rooms by status', async () => {
			await createRoom();
			await createRoom();
			const toClose = await createRoom();
			await updateRoomStatus(toClose.roomId, MeetRoomStatus.CLOSED);

			const response = await getAnalytics();
			expect(response.status).toBe(200);

			const analytics: MeetAnalytics = response.body;
			expect(analytics.totalRooms).toBe(3);
			expect(analytics.openRooms).toBe(2);
			expect(analytics.activeRooms).toBe(0);
			expect(analytics.closedRooms).toBe(1);
		});

		it('should count only the recordings that are in progress as in progress', async () => {
			const { roomId } = await createRoom({ roomName: 'analytics-statuses' });
			const recordingRepository = container.get(RecordingRepository);
			const statuses = [
				MeetRecordingStatus.STARTING,
				MeetRecordingStatus.ACTIVE,
				MeetRecordingStatus.ENDING,
				MeetRecordingStatus.COMPLETE,
				MeetRecordingStatus.FAILED,
				MeetRecordingStatus.ABORTED
			];

			for (const status of statuses) {
				await recordingRepository.create({
					recordingId: `${roomId}--EG_${status}--1234567890`,
					roomId,
					roomName: 'analytics-statuses',
					status,
					layout: MeetRecordingLayout.GRID,
					encoding: MeetRecordingEncodingPreset.H264_720P_30,
					startDate: Date.now() - ms('10m')
				});
			}

			const response = await getAnalytics();
			expect(response.status).toBe(200);

			const analytics: MeetAnalytics = response.body;
			expect(analytics.totalRecordings).toBe(6);
			expect(analytics.completeRecordings).toBe(1);
			expect(analytics.recordingsInProgress).toBe(3);
		});

		describe('rooms expiring soon', () => {
			const inDays = (days: number) => Date.now() + ms(`${days}d`);

			it('should count the rooms expiring in the next 7 days and name the first one', async () => {
				const first = await createRoom({ roomName: 'expires-in-two-days', autoDeletionDate: inDays(2) });
				await createRoom({ roomName: 'expires-in-six-days', autoDeletionDate: inDays(6) });
				await createRoom({ roomName: 'expires-in-ten-days', autoDeletionDate: inDays(10) });
				await createRoom({ roomName: 'never-expires' });

				const response = await getAnalytics();
				expect(response.status).toBe(200);

				const analytics: MeetAnalytics = response.body;
				expect(analytics.roomsExpiringSoon).toBe(2);
				expect(analytics.nextExpiringRoom).toEqual({
					roomId: first.roomId,
					roomName: 'expires-in-two-days',
					autoDeletionDate: first.autoDeletionDate
				});
			});

			it('should not count a room whose auto-deletion date has passed', async () => {
				const { roomId } = await createRoom({ roomName: 'already-expired', autoDeletionDate: inDays(1) });
				await MeetRoomModel.collection.updateOne(
					{ roomId },
					{ $set: { autoDeletionDate: Date.now() - ms('1d') } }
				);

				const response = await getAnalytics();
				expect(response.status).toBe(200);

				const analytics: MeetAnalytics = response.body;
				expect(analytics.roomsExpiringSoon).toBe(0);
				expect(analytics).not.toHaveProperty('nextExpiringRoom');
			});
		});
	});
});
