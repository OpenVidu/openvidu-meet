import { inject, injectable } from 'inversify';
import { LoggerService } from './index.js';
import { SystemEventService } from './system-event.service.js';
import { CronJob } from 'cron';
import { MutexService } from './mutex.service.js';
import { MeetLock } from '../helpers/redis.helper.js';
import ms from 'ms';
import { CronExpressionParser } from 'cron-parser';
import { MEET_RECORDING_STARTED_TIMEOUT } from '../environment.js';

export type TaskType = 'cron' | 'timeout';

export interface IScheduledTask {
	name: string;
	type: TaskType;
	scheduleOrDelay: ms.StringValue;
	callback: () => Promise<void>;
}

@injectable()
export class TaskSchedulerService {
	protected roomGarbageCollectorJob: CronJob | null = null;
	private recordingCleanupTimers: Map<string, NodeJS.Timeout> = new Map();

	private taskRegistry: IScheduledTask[] = [];
	private scheduledTasks = new Map<string, CronJob | NodeJS.Timeout>();
	private started = false;

	constructor(
		@inject(LoggerService) protected logger: LoggerService,
		@inject(SystemEventService) protected systemEventService: SystemEventService,
		@inject(MutexService) protected mutexService: MutexService
	) {
		this.systemEventService.onRedisReady(() => {
			this.logger.debug('Starting all registered tasks...');
			this.taskRegistry.forEach((task) => {
				this.scheduleTask(task);
			});
			this.started = true;
		});
	}

	/**
	 * Starts the room garbage collector which runs a specified callback function every hour.
	 * The garbage collector acquires a lock to ensure that only one instance runs at a time.
	 * If a lock cannot be acquired, the garbage collection is skipped for that hour.
	 *
	 * @param callbackFn - The callback function to be executed for garbage collection.
	 * @returns A promise that resolves when the garbage collector has been successfully started.
	 */
	async startRoomGarbageCollector(callbackFn: () => Promise<void>): Promise<void> {
		// Stop the existing job if it exists
		if (this.roomGarbageCollectorJob) {
			this.roomGarbageCollectorJob.stop();
			this.roomGarbageCollectorJob = null;
		}

		// Create a cron job to run every hour
		this.roomGarbageCollectorJob = new CronJob('0 * * * *', async () => {
			try {
				const lock = await this.mutexService.acquire(MeetLock.getRoomGarbageCollectorLock(), ms('59m'));

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
		this.logger.debug(`Recording cleanup timer (${MEET_RECORDING_STARTED_TIMEOUT}) scheduled for room ${roomId}.`);

		// Schedule a timeout to run the cleanup callback after a specified time
		const timeoutMs = ms(MEET_RECORDING_STARTED_TIMEOUT);
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

	/**
	 * Registers a new task to be scheduled.
	 * If the task is already registered, it will not be added again.
	 */
	public registerTask(task: IScheduledTask): void {
		if (this.taskRegistry.find((t) => t.name === task.name)) {
			this.logger.error(`Task with name "${task.name}" already exists.`);
			return;
		}

		this.logger.debug(`Registering task "${task.name}".`);
		this.taskRegistry.push(task);

		if (this.started) {
			this.scheduleTask(task);
		}
	}

	protected async scheduleTask(task: IScheduledTask): Promise<void> {
		const { name, type, scheduleOrDelay, callback } = task;

		if (this.scheduledTasks.has(name)) {
			this.logger.debug(`Task "${name}" already scheduled.`);
			return;
		}

		if (type === 'cron') {
			this.logger.debug(`Scheduling cron task "${name}" with schedule "${scheduleOrDelay}"`);
			const cronExpression = this.msStringToCronExpression(scheduleOrDelay);
			const lockDuration = this.getCronIntervalDuration(cronExpression);

			const job = new CronJob(cronExpression, async () => {
				try {
					this.logger.debug(`Attempting to acquire lock for cron task "${name}"`);

					const lock = await this.mutexService.acquire(MeetLock.getScheduledTaskLock(name), lockDuration);

					if (!lock) {
						this.logger.debug(`Task "${name}" skipped: another instance holds the lock.`);
						return;
					}

					this.logger.debug(`Running cron task "${name}"...`);
					await callback();
				} catch (error) {
					this.logger.error(`Error running cron task "${name}":`, error);
				}
			});
			// Start the job immediately
			await callback();
			job.start();
			this.scheduledTasks.set(name, job);
		} else if (type === 'timeout') {
			this.logger.debug(`Scheduling timeout task "${name}" with delay ${scheduleOrDelay}`);
			const timeoutId = setTimeout(
				async () => {
					try {
						await callback();
					} catch (error) {
						this.logger.error(`Error running timeout task "${name}":`, error);
					}
				},
				ms(scheduleOrDelay as ms.StringValue)
			);
			this.scheduledTasks.set(name, timeoutId);
		}
	}

	/**
	 * Cancel the scheduled task with the given name.
	 */
	public cancelTask(name: string): void {
		const scheduled = this.scheduledTasks.get(name);

		if (scheduled) {
			if (scheduled instanceof CronJob) {
				scheduled.stop();
			} else {
				clearTimeout(scheduled as NodeJS.Timeout);
			}

			this.scheduledTasks.delete(name);
			this.logger.debug(`Task "${name}" cancelled.`);
		}
	}

	protected getCronIntervalDuration(cronExpression: string): number {
		try {
			// Parse the cron expression using cron-parser
			const interval = CronExpressionParser.parse(cronExpression);

			// Get the next interval time
			const next = interval.next().getTime();

			// Get the current time
			const afterNext = interval.next().getTime();

			// Calculate the interval duration in milliseconds
			const intervalMs = afterNext - next;
			// Return the interval duration minus 1 minute for ensuring the lock expires before the next iteration
			return Math.max(intervalMs - ms('1m'), ms('10s'));
		} catch (error) {
			this.logger.error('Error parsing cron expression:', error);
			throw new Error('Invalid cron expression');
		}
	}

	/**
	 * Converts a human-readable time string to a cron expression.
	 *
	 * This method takes a string representation of a time duration (e.g., '1h', '30m', '1d')
	 * and converts it to an equivalent cron expression that would trigger at that interval.
	 * The conversion uses different cron patterns based on the duration magnitude:
	 * - For days: Runs at midnight every X days
	 * - For hours: Runs at the start of every X hours
	 * - For minutes: Runs every X minutes
	 * - For seconds ≥ 30: Runs every minute
	 * - For seconds < 30: Runs every X seconds
	 *
	 * @param msString - A string representing time duration (parsed by the 'ms' library)
	 * @returns A cron expression string that represents the equivalent scheduling interval
	 *
	 */
	protected msStringToCronExpression(msString: ms.StringValue): string {
		const milliseconds = ms(msString);
		const totalSeconds = Math.floor(milliseconds / 1000);
		const seconds = totalSeconds % 60;
		const minutes = Math.floor(totalSeconds / 60) % 60;
		const hours = Math.floor(totalSeconds / 3600) % 24;
		const days = Math.floor(totalSeconds / 86400);

		if (days > 0) {
			return `0 0 */${days} * *`;
		} else if (hours > 0) {
			return `0 0 */${hours} * * *`;
		} else if (minutes > 0) {
			return `0 */${minutes} * * * *`;
		} else if (seconds >= 30) {
			return `0 * * * * *`;
		} else {
			return `*/${Math.max(seconds, 1)} * * * * *`;
		}
	}
}
