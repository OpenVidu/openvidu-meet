import { inject, injectable } from 'inversify';
import { INTERNAL_CONFIG } from '../config/internal-config.js';
import { BroadcastService } from './broadcast.service.js';
import { TaskSchedulerService } from './task-scheduler.service.js';

/**
 * Registers the sweep that settles broadcasts LiveKit's webhooks left behind, which nothing else
 * would remove from Redis since their state never expires.
 */
@injectable()
export class BroadcastScheduledTasksService {
	constructor(
		@inject(BroadcastService) protected broadcastService: BroadcastService,
		@inject(TaskSchedulerService) protected taskSchedulerService: TaskSchedulerService
	) {
		this.taskSchedulerService.registerTask({
			name: 'broadcastsReconciliationGC',
			type: 'cron',
			scheduleOrDelay: INTERNAL_CONFIG.BROADCAST_RECONCILIATION_GC_INTERVAL,
			callback: () => this.broadcastService.reconcileAllRooms()
		});
	}
}
