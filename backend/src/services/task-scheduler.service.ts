import { inject, injectable } from 'inversify';
import { LoggerService } from './index.js';
import { SystemEventService } from './system-event.service.js';
import { CronJob } from 'cron';
import { MutexService } from './mutex.service.js';
import { MeetLock } from '../helpers/redis.helper.js';
import ms from 'ms';
import { MEET_RECORDING_CLEANUP_TIMEOUT } from '../environment.js';

@injectable()
export class TaskSchedulerService {
	protected roomGarbageCollectorJob: CronJob | null = null;
	private recordingCleanupTimers: Map<string, NodeJS.Timeout> = new Map();

	constructor(
		@inject(LoggerService) protected logger: LoggerService,
		@inject(SystemEventService) protected systemEventService: SystemEventService,
		@inject(MutexService) protected mutexService: MutexService
	) {}

	/**
	 * Starts the room garbage collector which runs a specified callback function every hour.
	 * The garbage collector acquires a lock to ensure that only one instance runs at a time.
	 * If a lock cannot be acquired, the garbage collection is skipped for that hour.
	 *
	 * @param callbackFn - The callback function to be executed for garbage collection.
	 * @returns A promise that resolves when the garbage collector has been successfully started.
	 */
	async startRoomGarbageCollector(callbackFn: () => Promise<void>): Promise<void> {
		const lockTtl = 59 * 60 * 1000; // TTL of 59 minutes

		if (this.roomGarbageCollectorJob) {
			this.roomGarbageCollectorJob.stop();
			this.roomGarbageCollectorJob = null;
		}

		// Create a cron job to run every hour
		this.roomGarbageCollectorJob = new CronJob('0 * * * *', async () => {
			try {
				const lock = await this.mutexService.acquire(RedisLockName.GARBAGE_COLLECTOR, lockTtl);

				if (!lock) {
					this.logger.debug('Failed to acquire lock for room garbage collection. Skipping.');
					return;
				}

				this.logger.debug('Lock acquired for room garbage collection.');

				await callbackFn();
			} catch (error) {
				this.logger.error('Error running room garbage collection:', error);
			}
		});

		// Start the job
		this.logger.debug('Starting room garbage collector');
		this.roomGarbageCollectorJob.start();
	}

	/**
	 * Schedules a cleanup timer for a recording that has just started.
	 *
	 * If the egress_started webhook is not received before the timer expires,
	 * this timer will execute a cleanup callback by stopping the recording and releasing
	 * the active lock for the specified room.
	 */
	async scheduleRecordingCleanupTimer(roomId: string, cleanupCallback: () => Promise<void>): Promise<void> {
		this.logger.debug(`Recording cleanup timer (${MEET_RECORDING_CLEANUP_TIMEOUT}) scheduled for room ${roomId}.`);

		// Schedule a timeout to run the cleanup callback after a specified time
		const timeoutMs = ms(MEET_RECORDING_CLEANUP_TIMEOUT);
		const timer = setTimeout(async () => {
			this.logger.warn(`Recording cleanup timer expired for room ${roomId}. Initiating cleanup process.`);
			this.recordingCleanupTimers.delete(roomId);
			await cleanupCallback();
		}, timeoutMs);
		this.recordingCleanupTimers.set(roomId, timer);
	}

	cancelRecordingCleanupTimer(roomId: string): void {
		const timer = this.recordingCleanupTimers.get(roomId);

		if (timer) {
			clearTimeout(timer);
			this.recordingCleanupTimers.delete(roomId);
			this.logger.info(`Recording cleanup timer cancelled for room ${roomId}`);
		}
	}

	async startRecordingLockGarbageCollector(callbackFn: () => Promise<void>): Promise<void> {
		// Create a cron job to run every minute
		const recordingLockGarbageCollectorJob = new CronJob('0 * * * * *', async () => {
			try {
				await callbackFn();
			} catch (error) {
				this.logger.error('Error running recording lock garbage collection:', error);
			}
		});
	}
}
