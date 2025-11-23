import { MeetAnalytics } from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
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
			this.logger.info('Retrieving analytics data...');

			// Fetch all metrics in parallel for better performance
			const [totalRooms, activeRooms, totalRecordings, completeRecordings] = await Promise.all([
				this.roomRepository.countTotal(),
				this.roomRepository.countActiveRooms(),
				this.recordingRepository.countTotal(),
				this.recordingRepository.countCompleteRecordings()
			]);

			const analytics: MeetAnalytics = {
				totalRooms,
				activeRooms,
				totalRecordings,
				completeRecordings
			};

			this.logger.info('Analytics data retrieved successfully', analytics);
			return analytics;
		} catch (error) {
			this.logger.error('Error retrieving analytics data:', error);
			throw error;
		}
	}
}
