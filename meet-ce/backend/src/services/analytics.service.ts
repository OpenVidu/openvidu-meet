import { MeetRecordingStatus, MeetRoomStatus } from '@openvidu-meet/typings';
import type { MeetAnalytics } from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import ms from 'ms';
import { INTERNAL_CONFIG } from '../config/internal-config.js';
import { RecordingRepository } from '../repositories/recording.repository.js';
import { RoomRepository } from '../repositories/room.repository.js';
import { LoggerService } from './logger.service.js';

/**
 * The figure each status counts towards. Every status has one, so the figures of a kind add up to all the
 * documents of that kind and the total needs no count of its own.
 */
const ROOM_STATUS_FIGURE = {
	[MeetRoomStatus.OPEN]: 'openRooms',
	[MeetRoomStatus.ACTIVE_MEETING]: 'activeRooms',
	[MeetRoomStatus.CLOSED]: 'closedRooms'
} as const satisfies Record<MeetRoomStatus, keyof MeetAnalytics>;

const RECORDING_STATUS_FIGURE = {
	[MeetRecordingStatus.STARTING]: 'recordingsInProgress',
	[MeetRecordingStatus.ACTIVE]: 'recordingsInProgress',
	[MeetRecordingStatus.ENDING]: 'recordingsInProgress',
	[MeetRecordingStatus.COMPLETE]: 'completeRecordings',
	[MeetRecordingStatus.FAILED]: 'failedRecordings',
	[MeetRecordingStatus.ABORTED]: 'failedRecordings',
	[MeetRecordingStatus.LIMIT_REACHED]: 'failedRecordings'
} as const satisfies Record<MeetRecordingStatus, keyof MeetAnalytics>;

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

			const [rooms, recordings, roomsExpiringSoon, nextExpiringRoom] = await Promise.all([
				this.countByFigure(ROOM_STATUS_FIGURE, (status) => this.roomRepository.countByStatus(status)),
				this.countByFigure(RECORDING_STATUS_FIGURE, (status) => this.recordingRepository.countByStatus(status)),
				this.roomRepository.countExpiringRooms(now, expiringUntil),
				this.roomRepository.findNextExpiringRoom(now, expiringUntil)
			]);

			const analytics: MeetAnalytics = {
				totalRooms: rooms.total,
				activeRooms: rooms.activeRooms,
				openRooms: rooms.openRooms,
				closedRooms: rooms.closedRooms,
				totalRecordings: recordings.total,
				completeRecordings: recordings.completeRecordings,
				recordingsInProgress: recordings.recordingsInProgress,
				failedRecordings: recordings.failedRecordings,
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

	private async countByFigure<TStatus extends string, TFigure extends string>(
		figureOf: Record<TStatus, TFigure>,
		countByStatus: (status: TStatus) => Promise<number>
	): Promise<Record<TFigure | 'total', number>> {
		const figures = { total: 0 } as Record<TFigure | 'total', number>;

		await Promise.all(
			(Object.keys(figureOf) as TStatus[]).map(async (status) => {
				const count = await countByStatus(status);
				figures[figureOf[status]] = (figures[figureOf[status]] ?? 0) + count;
				figures.total += count;
			})
		);

		return figures;
	}
}
