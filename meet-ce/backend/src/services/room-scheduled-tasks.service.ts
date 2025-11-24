import { inject, injectable } from 'inversify';
import { INTERNAL_CONFIG } from '../config/internal-config.js';
import { IScheduledTask } from '../models/task-scheduler.model.js';
import { RoomRepository } from '../repositories/room.repository.js';
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
		@inject(TaskSchedulerService) protected taskSchedulerService: TaskSchedulerService
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
}
