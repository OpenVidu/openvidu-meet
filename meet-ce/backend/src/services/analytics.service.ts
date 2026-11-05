import { MeetRoomStatus } from '@openvidu-meet/typings';
import type { MeetAnalytics } from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import ms from 'ms';
import { INTERNAL_CONFIG } from '../config/internal-config.js';
import { RecordingRepository } from '../repositories/recording.repository.js';
import { RoomRepository } from '../repositories/room.repository.js';
import { LoggerService } from './logger.service.js';

/**
 * Service for retrieving analytics data about OpenVidu Meet usage.
 * Provides metrics on rooms and recordings.
 */
@injectable()
export class AnalyticsService {
	constructor(
		@inject(LoggerService) private logger: LoggerService,
		@inject(RoomRepository) private roomRepository: RoomRepository,
		@inject(RecordingRepository) private recordingRepository: RecordingRepository
	) {}

	/**
	 * Retrieves usage analytics for OpenVidu Meet.
	 * Includes metrics for rooms and recordings.
	 *
	 * @returns Analytics data with room and recording metrics
	 */
	async getAnalytics(): Promise<MeetAnalytics> {
		try {
			this.logger.verbose('Retrieving analytics data...');

			const now = Date.now();
			const expiringUntil = now + ms(INTERNAL_CONFIG.ANALYTICS_EXPIRING_ROOMS_WINDOW);

			// Fetch all metrics in parallel for better performance
			const [
				totalRooms,
				activeRooms,
				openRooms,
				closedRooms,
				totalRecordings,
				completeRecordings,
				recordingsInProgress,
				roomsExpiringSoon,
				nextExpiringRoom
			] = await Promise.all([
				this.roomRepository.countTotal(),
				this.roomRepository.countByStatus(MeetRoomStatus.ACTIVE_MEETING),
				this.roomRepository.countByStatus(MeetRoomStatus.OPEN),
				this.roomRepository.countByStatus(MeetRoomStatus.CLOSED),
				this.recordingRepository.countTotal(),
				this.recordingRepository.countCompleteRecordings(),
				this.recordingRepository.countInProgress(),
				this.roomRepository.countExpiringRooms(now, expiringUntil),
				this.roomRepository.findNextExpiringRoom(now, expiringUntil)
			]);

			const analytics: MeetAnalytics = {
				totalRooms,
				activeRooms,
				openRooms,
				closedRooms,
				totalRecordings,
				completeRecordings,
				recordingsInProgress,
				roomsExpiringSoon,
				...(nextExpiringRoom && { nextExpiringRoom })
			};

			this.logger.verbose('Analytics data retrieved successfully');
			return analytics;
		} catch (error) {
			this.logger.debug('Error retrieving analytics data:', error);
			throw error;
		}
	}
}
