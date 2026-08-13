import { inject, injectable } from 'inversify';
import type { Room } from 'livekit-server-sdk';
import { INTERNAL_CONFIG } from '../config/internal-config.js';
import { MeetRoomHelper } from '../helpers/room.helper.js';
import type { IScheduledTask } from '../models/task-scheduler.model.js';
import { RoomRepository } from '../repositories/room.repository.js';
import { runConcurrently } from '../utils/concurrency.utils.js';
import { LivekitWebhookService } from './livekit-webhook.service.js';
import { LiveKitService } from './livekit.service.js';
import { LoggerService } from './logger.service.js';
import { RoomService } from './room.service.js';
import { TaskSchedulerService } from './task-scheduler.service.js';

/**
 * Service responsible for managing scheduled tasks related to rooms.
 *
 * This service handles periodic cleanup operations for rooms, such as:
 * - Deleting expired rooms based on their auto-deletion date
 */
@injectable()
export class RoomScheduledTasksService {
	constructor(
		@inject(LoggerService) protected logger: LoggerService,
		@inject(RoomRepository) protected roomRepository: RoomRepository,
		@inject(RoomService) protected roomService: RoomService,
		@inject(TaskSchedulerService) protected taskSchedulerService: TaskSchedulerService,
		@inject(LiveKitService) protected livekitService: LiveKitService,
		@inject(LivekitWebhookService) protected livekitWebhookService: LivekitWebhookService
	) {
		this.registerScheduledTasks();
	}

	/**
	 * Registers all scheduled tasks related to rooms.
	 */
	protected registerScheduledTasks(): void {
		const expiredRoomsGCTask: IScheduledTask = {
			name: 'expiredRoomsGC',
			type: 'cron',
			scheduleOrDelay: INTERNAL_CONFIG.ROOM_EXPIRED_GC_INTERVAL,
			callback: this.deleteExpiredRooms.bind(this)
		};
		this.taskSchedulerService.registerTask(expiredRoomsGCTask);

		const validateRoomsStatusGCTask: IScheduledTask = {
			name: 'validateRoomsStatusGC',
			type: 'cron',
			scheduleOrDelay: INTERNAL_CONFIG.ROOM_ACTIVE_VERIFICATION_GC_INTERVAL,
			callback: this.validateRoomsStatusGC.bind(this)
		};
		this.taskSchedulerService.registerTask(validateRoomsStatusGCTask);

		const meetingMaxDurationGCTask: IScheduledTask = {
			name: 'meetingMaxDurationGC',
			type: 'cron',
			scheduleOrDelay: INTERNAL_CONFIG.MEETING_MAX_DURATION_GC_INTERVAL,
			callback: this.enforceMeetingMaxDurationGC.bind(this)
		};
		this.taskSchedulerService.registerTask(meetingMaxDurationGCTask);
	}

	/**
	 * Performs garbage collection for expired rooms.
	 *
	 * This method checks for rooms that have an auto-deletion date in the past and
	 * tries to delete them based on their auto-deletion policy.
	 */
	protected async deleteExpiredRooms(): Promise<void> {
		this.logger.verbose(`Checking expired rooms at ${new Date(Date.now()).toISOString()}`);

		try {
			const BATCH_SIZE = INTERNAL_CONFIG.BATCH_SIZE_ROOMS_EXPIRED_GC;
			let nextPageToken: string | undefined;
			let hasMore = true;
			let totalDeletedCandidates = 0;
			let hasAnyExpiredRoom = false;

			while (hasMore) {
				const expiredRoomsPage = await this.roomRepository.findExpiredRooms(BATCH_SIZE, nextPageToken);

				if (expiredRoomsPage.rooms.length === 0) {
					break;
				}

				hasAnyExpiredRoom = true;
				totalDeletedCandidates += expiredRoomsPage.rooms.length;
				this.logger.verbose(
					`Trying to delete batch of ${expiredRoomsPage.rooms.length} expired Meet rooms: ${expiredRoomsPage.rooms.map((room) => room.roomId).join(', ')}`
				);

				await this.roomService.bulkDeleteMeetRooms(expiredRoomsPage.rooms);

				hasMore = expiredRoomsPage.isTruncated;
				nextPageToken = expiredRoomsPage.nextPageToken;
			}

			if (!hasAnyExpiredRoom) {
				this.logger.verbose(`No expired rooms found.`);
				return;
			}

			this.logger.verbose(`Expired rooms cleanup finished. Total rooms processed: ${totalDeletedCandidates}`);
		} catch (error) {
			this.logger.error('Error deleting expired rooms:', error);
		}
	}

	/**
	 * Checks for inconsistent rooms.
	 *
	 * This method checks for rooms that are marked as active in the database but do not exist in LiveKit.
	 * If such a room is found, it triggers the room finished logic to clean up the room.
	 */
	protected async validateRoomsStatusGC(): Promise<void> {
		this.logger.verbose(`Checking inconsistent rooms at ${new Date(Date.now()).toISOString()}`);

		try {
			const BATCH_SIZE = INTERNAL_CONFIG.BATCH_SIZE_ROOMS_STATUS_VALIDATION_GC;
			let nextPageToken: string | undefined;
			let hasMore = true;
			let hasAnyActiveRoom = false;
			let totalInconsistentRooms = 0;

			while (hasMore) {
				const activeRoomsPage = await this.roomRepository.findActiveRooms(BATCH_SIZE, nextPageToken);

				if (activeRoomsPage.rooms.length === 0) {
					break;
				}

				hasAnyActiveRoom = true;

				const roomIds: string[] = activeRoomsPage.rooms.map((room) => room.roomId);
				const roomExistenceMap = await this.livekitService.roomsExist(roomIds);

				const roomsToCleanup = activeRoomsPage.rooms.filter((room) => {
					const exists = roomExistenceMap.get(room.roomId);
					return !exists;
				});

				totalInconsistentRooms += roomsToCleanup.length;

				if (roomsToCleanup.length > 0) {
					this.logger.warn(
						`Found ${roomsToCleanup.length} rooms active in DB but not in LiveKit in current batch. Cleaning up...`
					);

					await runConcurrently(
						roomsToCleanup,
						async (room) => {
							try {
								await this.livekitWebhookService.handleRoomFinished({ name: room.roomId } as unknown as Room);
							} catch (error) {
								this.logger.error(`Error cleaning up room '${room.roomId}':`, error);
								// Continue with other rooms even if one fails
							}
						},
						{ concurrency: INTERNAL_CONFIG.CONCURRENCY_VALIDATE_ROOMS_STATUS, failFast: true }
					);
				}

				hasMore = activeRoomsPage.isTruncated;
				nextPageToken = activeRoomsPage.nextPageToken;
			}

			if (!hasAnyActiveRoom) {
				this.logger.verbose(`No active rooms found. Skipping room consistency check.`);
				return;
			}

			if (totalInconsistentRooms === 0) {
				this.logger.verbose(`All active rooms are consistent with LiveKit. No cleanup needed.`);
				return;
			}

			this.logger.warn(`Room consistency check finished. Total inconsistent rooms processed: ${totalInconsistentRooms}`);
		} catch (error) {
			this.logger.error('Error checking inconsistent rooms:', error);
		}
	}

	/**
	 * Ends the meetings that have exceeded their room's `maxDurationMinutes`.
	 *
	 * LiveKit has no native duration limit, so this periodic sweep is the enforcement: it walks
	 * the active rooms that declare a limit, compares the LiveKit room's creation time against it,
	 * and ends the expired ones by deleting the LiveKit room — the exact flow a moderator's
	 * `meetingEnd` triggers, so participants leave with the `meeting_ended` reason and the
	 * `meetingEnded` webhook fires. A meeting can overrun its limit by up to the sweep interval.
	 */
	protected async enforceMeetingMaxDurationGC(): Promise<void> {
		this.logger.verbose(`Checking meetings over their duration limit at ${new Date(Date.now()).toISOString()}`);

		try {
			const BATCH_SIZE = INTERNAL_CONFIG.BATCH_SIZE_MEETING_MAX_DURATION_GC;
			let nextPageToken: string | undefined;
			let hasMore = true;
			let totalEndedMeetings = 0;

			while (hasMore) {
				const limitedRoomsPage = await this.roomRepository.findActiveRoomsWithMaxDuration(
					BATCH_SIZE,
					nextPageToken
				);

				if (limitedRoomsPage.rooms.length === 0) {
					break;
				}

				const results = await runConcurrently(
					limitedRoomsPage.rooms,
					async (room) => {
						const maxDurationMinutes = room.config.maxDurationMinutes;

						if (!maxDurationMinutes) {
							return false;
						}

						try {
							// The meeting start is the LiveKit room's creation time. A room that is
							// gone by now simply ended on its own; the status GC reconciles it.
							const livekitRoom = await this.livekitService.getRoom(room.roomId);
							const creationTimeSeconds = Number(livekitRoom.creationTime);

							if (
								!MeetRoomHelper.isMeetingOverMaxDuration(
									creationTimeSeconds,
									maxDurationMinutes,
									Date.now()
								)
							) {
								return false;
							}

							this.logger.info(
								`Meeting in room '${room.roomId}' exceeded its ${maxDurationMinutes}-minute limit. Ending it.`
							);
							await this.livekitService.deleteRoom(room.roomId);
							return true;
						} catch (error) {
							this.logger.error(`Error enforcing the duration limit of room '${room.roomId}':`, error);
							// Continue with other rooms even if one fails
							return false;
						}
					},
					{ concurrency: INTERNAL_CONFIG.CONCURRENCY_MEETING_MAX_DURATION_GC, failFast: true }
				);

				totalEndedMeetings += results.filter(Boolean).length;

				hasMore = limitedRoomsPage.isTruncated;
				nextPageToken = limitedRoomsPage.nextPageToken;
			}

			if (totalEndedMeetings > 0) {
				this.logger.info(`Meeting duration sweep finished. Meetings ended: ${totalEndedMeetings}`);
			}
		} catch (error) {
			this.logger.error('Error checking meetings over their duration limit:', error);
		}
	}
}
