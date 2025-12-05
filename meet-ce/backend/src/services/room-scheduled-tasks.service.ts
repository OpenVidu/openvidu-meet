import { inject, injectable } from 'inversify';
import { Room } from 'livekit-server-sdk';
import { INTERNAL_CONFIG } from '../config/internal-config.js';
import { IScheduledTask } from '../models/task-scheduler.model.js';
import { RoomRepository } from '../repositories/room.repository.js';
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
			const expiredRooms = await this.roomRepository.findExpiredRooms();

			if (expiredRooms.length === 0) {
				this.logger.verbose(`No expired rooms found.`);
				return;
			}

			this.logger.verbose(
				`Trying to delete ${expiredRooms.length} expired Meet rooms: ${expiredRooms.map((room) => room.roomId).join(', ')}`
			);
			await this.roomService.bulkDeleteMeetRooms(expiredRooms);
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
			const activeRooms = await this.roomRepository.findActiveRooms();

			if (activeRooms.length === 0) {
				this.logger.verbose(`No active rooms found. Skipping room consistency check.`);
				return;
			}

			for (const room of activeRooms) {
				const roomExists = await this.livekitService.roomExists(room.roomId);

				if (!roomExists) {
					this.logger.warn(
						`Room '${room.roomId}' is active in DB but does not exist in LiveKit. Cleaning up...`
					);
					await this.livekitWebhookService.handleRoomFinished({ name: room.roomId } as unknown as Room);
				}
			}
		} catch (error) {
			this.logger.error('Error checking inconsistent rooms:', error);
		}
	}
}
