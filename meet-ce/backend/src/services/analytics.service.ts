import { MEET_RECORDING_STATUS_FIGURE, MeetRoomStatus, MeetUserRole } from '@openvidu-meet/typings';
import type { MeetAnalytics, MeetRecordingsSummary, MeetRoomsSummary, MeetUsersSummary } from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import ms from 'ms';
import { INTERNAL_CONFIG } from '../config/internal-config.js';
import { RecordingRepository } from '../repositories/recording.repository.js';
import { RoomRepository } from '../repositories/room.repository.js';
import { UserRepository } from '../repositories/user.repository.js';
import type { RecordingAccessScope } from '../types/recording-projection.types.js';
import type { RoomAccessScope } from '../types/room-projection.types.js';
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

/**
 * Service for retrieving the figures of OpenVidu Meet: the usage analytics and the summaries the console lists show.
 * A summary counts what the list of its kind returns to a caller, which an empty scope makes the whole deployment.
 */
@injectable()
export class AnalyticsService {
	constructor(
		@inject(LoggerService) private logger: LoggerService,
		@inject(RoomRepository) private roomRepository: RoomRepository,
		@inject(RecordingRepository) private recordingRepository: RecordingRepository,
		@inject(UserRepository) private userRepository: UserRepository
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

			const [rooms, recordings] = await Promise.all([this.getRoomsSummary(), this.getRecordingsSummary()]);

			this.logger.verbose('Analytics data retrieved successfully');
			return { ...rooms, ...recordings };
		} catch (error) {
			this.logger.debug('Error retrieving analytics data:', error);
			throw error;
		}
	}

	/**
	 * Counts the rooms of the access scope.
	 */
	async getRoomsSummary(scope: RoomAccessScope = {}): Promise<MeetRoomsSummary> {
		const now = Date.now();
		const expiringUntil = now + ms(INTERNAL_CONFIG.ANALYTICS_EXPIRING_ROOMS_WINDOW);

		const [countByStatus, roomsExpiringSoon, nextExpiringRoom] = await Promise.all([
			this.roomRepository.countByStatusInScope(scope),
			this.roomRepository.countExpiringRooms(now, expiringUntil, scope),
			this.roomRepository.findNextExpiringRoom(now, expiringUntil, scope)
		]);
		const rooms = this.sumByFigure(ROOM_STATUS_FIGURE, countByStatus);

		return {
			totalRooms: rooms.total,
			activeRooms: rooms.activeRooms,
			openRooms: rooms.openRooms,
			closedRooms: rooms.closedRooms,
			roomsExpiringSoon,
			...(nextExpiringRoom && { nextExpiringRoom })
		};
	}

	/**
	 * Counts the recordings of the access scope.
	 */
	async getRecordingsSummary(scope: RecordingAccessScope = {}): Promise<MeetRecordingsSummary> {
		const recordings = this.sumByFigure(
			MEET_RECORDING_STATUS_FIGURE,
			await this.recordingRepository.countByStatusInScope(scope)
		);

		return {
			totalRecordings: recordings.total,
			completeRecordings: recordings.completeRecordings,
			recordingsInProgress: recordings.recordingsInProgress,
			failedRecordings: recordings.failedRecordings
		};
	}

	/**
	 * Counts the users by role.
	 */
	async getUsersSummary(): Promise<MeetUsersSummary> {
		const countByRole = await this.userRepository.countByRole();
		const adminUsers = countByRole[MeetUserRole.ADMIN] ?? 0;
		const roomManagerUsers = countByRole[MeetUserRole.ROOM_MANAGER] ?? 0;
		const roomMemberUsers = countByRole[MeetUserRole.ROOM_MEMBER] ?? 0;

		return {
			totalUsers: adminUsers + roomManagerUsers + roomMemberUsers,
			adminUsers,
			roomManagerUsers,
			roomMemberUsers
		};
	}

	private sumByFigure<TStatus extends string, TFigure extends string>(
		figureOf: Record<TStatus, TFigure>,
		countByStatus: Partial<Record<TStatus, number>>
	): Record<TFigure | 'total', number> {
		const figures = { total: 0 } as Record<TFigure | 'total', number>;

		for (const status of Object.keys(figureOf) as TStatus[]) {
			const count = countByStatus[status] ?? 0;
			figures[figureOf[status]] = (figures[figureOf[status]] ?? 0) + count;
			figures.total += count;
		}

		return figures;
	}
}
