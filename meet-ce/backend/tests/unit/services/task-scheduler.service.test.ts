import { afterEach, describe, expect, it } from '@jest/globals';
import ms from 'ms';
// The service modules form a cycle through the DI container module, so it has to be the one that
// starts the graph (see room-scheduled-tasks.service.test.ts).
import '../../../src/config/dependency-injector.config.js';
import type { IScheduledTask } from '../../../src/models/task-scheduler.model.js';
import { TaskSchedulerService } from '../../../src/services/task-scheduler.service.js';

const noopLogger = { info: () => {}, warn: () => {}, debug: () => {}, error: () => {}, verbose: () => {} };

const flush = () => new Promise((resolve) => setImmediate(resolve));

const waitUntil = async (condition: () => boolean, timeoutMs = 3000) => {
	const deadline = Date.now() + timeoutMs;

	while (!condition() && Date.now() < deadline) {
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
};

class FakeRedisService {
	private readyCallbacks: (() => void)[] = [];
	private disconnectedCallbacks: (() => void)[] = [];

	onReady(callback: () => void): void {
		this.readyCallbacks.push(callback);
	}

	onDisconnected(callback: () => void): void {
		this.disconnectedCallbacks.push(callback);
	}

	emitReady(): void {
		this.readyCallbacks.forEach((callback) => callback());
	}

	emitDisconnected(): void {
		this.disconnectedCallbacks.forEach((callback) => callback());
	}
}

class FakeMutexService {
	ttls: number[] = [];

	async withLock<T>(_lockKey: string, ttl: number, callback: () => Promise<T>): Promise<T | null> {
		this.ttls.push(ttl);
		return callback();
	}
}

class TestableTaskSchedulerService extends TaskSchedulerService {
	scheduledNames(): string[] {
		return [...this.scheduledTasks.keys()];
	}

	registeredNames(): string[] {
		return this.taskRegistry.map((task) => task.name);
	}

	scheduledHandle(name: string): unknown {
		return this.scheduledTasks.get(name);
	}

	toCron(schedule: ms.StringValue): string {
		return this.msStringToCronExpression(schedule);
	}
}

const cronTask = (name: string, runs: string[]): IScheduledTask => ({
	name,
	type: 'cron',
	scheduleOrDelay: '1h',
	callback: async () => {
		runs.push(name);
	}
});

const openSchedulers: { service: TestableTaskSchedulerService; events: FakeRedisService }[] = [];

const buildScheduler = () => {
	const events = new FakeRedisService();
	const mutex = new FakeMutexService();
	const service = new TestableTaskSchedulerService(
		...([noopLogger, events, mutex] as unknown as ConstructorParameters<typeof TaskSchedulerService>)
	);
	openSchedulers.push({ service, events });
	return { service, events, mutex };
};

// A Redis disconnection no longer stops the timeout tasks, so pending ones are cancelled by hand.
afterEach(() => {
	openSchedulers.splice(0).forEach(({ service, events }) => {
		service.registeredNames().forEach((name) => service.cancelTask(name));
		events.emitDisconnected();
	});
});

describe('TaskSchedulerService', () => {
	it('reschedules the registered tasks when Redis comes back', async () => {
		const runs: string[] = [];
		const { service, events } = buildScheduler();
		service.registerTask(cronTask('expiredRoomsGC', runs));
		service.registerTask(cronTask('reconcileDurationLimitTimersGC', runs));

		events.emitReady();
		await flush();
		expect(service.scheduledNames()).toEqual(['expiredRoomsGC', 'reconcileDurationLimitTimersGC']);

		events.emitDisconnected();
		expect(service.scheduledNames()).toEqual([]);
		expect(service.registeredNames()).toEqual(['expiredRoomsGC', 'reconcileDurationLimitTimersGC']);

		events.emitReady();
		await flush();
		expect(service.scheduledNames()).toEqual(['expiredRoomsGC', 'reconcileDurationLimitTimersGC']);
	});

	it('does not resurrect a task cancelled while Redis was down', async () => {
		const runs: string[] = [];
		const { service, events } = buildScheduler();
		service.registerTask(cronTask('expiredRoomsGC', runs));
		service.registerTask(cronTask('reconcileDurationLimitTimersGC', runs));

		events.emitReady();
		await flush();
		events.emitDisconnected();
		service.cancelTask('expiredRoomsGC');

		events.emitReady();
		await flush();
		expect(service.scheduledNames()).toEqual(['reconcileDurationLimitTimersGC']);
		expect(service.registeredNames()).toEqual(['reconcileDurationLimitTimersGC']);
	});

	/**
	 * D1: a timeout task carries a delay, not an absolute deadline, so stopping it on a Redis blip
	 * and rescheduling it on reconnect would push a meeting's end out by the whole downtime.
	 */
	it('keeps a timeout task armed across a Redis blip instead of restarting its delay', async () => {
		const { service, events } = buildScheduler();
		service.registerTask({
			name: 'durationLimitTimer_room-1',
			type: 'timeout',
			scheduleOrDelay: '1h',
			callback: async () => {}
		});

		events.emitReady();
		await flush();
		const armed = service.scheduledHandle('durationLimitTimer_room-1');
		expect(armed).toBeDefined();

		events.emitDisconnected();
		expect(service.scheduledNames()).toEqual(['durationLimitTimer_room-1']);

		events.emitReady();
		await flush();
		expect(service.scheduledHandle('durationLimitTimer_room-1')).toBe(armed);
	});

	it('runs the first execution once when Redis reports ready twice in a row', async () => {
		const runs: string[] = [];
		const { service, events } = buildScheduler();
		service.registerTask(cronTask('expiredRoomsGC', runs));

		events.emitReady();
		events.emitReady();
		await flush();

		expect(runs).toEqual(['expiredRoomsGC']);
		expect(service.scheduledNames()).toEqual(['expiredRoomsGC']);
	});

	/**
	 * M6: scheduleTask used to await the first execution before recording the job, so a second
	 * scheduling in that window passed the duplicate guard and left a job nothing could ever stop.
	 */
	it('leaves no cron job running after a disconnect, even when it was scheduled twice', async () => {
		const runs: string[] = [];
		const { service, events } = buildScheduler();
		service.registerTask({ ...cronTask('everySecondGC', runs), scheduleOrDelay: '1s' });

		events.emitReady();
		events.emitReady();
		await flush();
		events.emitDisconnected();
		expect(service.scheduledNames()).toEqual([]);

		const runsAfterStop = runs.length;
		await new Promise((resolve) => setTimeout(resolve, 1300));
		expect(runs).toHaveLength(runsAfterStop);
	});

	it('keeps the first task registered under a name and ignores the rest', () => {
		const runs: string[] = [];
		const { service } = buildScheduler();
		service.registerTask(cronTask('expiredRoomsGC', runs));

		service.registerTask(cronTask('expiredRoomsGC', runs));

		expect(service.registeredNames()).toEqual(['expiredRoomsGC']);
	});

	it('schedules a task only while Redis is ready', async () => {
		const runs: string[] = [];
		const { service, events } = buildScheduler();

		service.registerTask(cronTask('beforeReady', runs));
		expect(service.scheduledNames()).toEqual([]);

		events.emitReady();
		await flush();
		service.registerTask(cronTask('whileReady', runs));
		await flush();
		expect(service.scheduledNames()).toEqual(['beforeReady', 'whileReady']);

		events.emitDisconnected();
		service.registerTask(cronTask('whileDown', runs));
		expect(service.scheduledNames()).toEqual([]);
	});

	it('holds the cron lock until a minute before the next run', async () => {
		const runs: string[] = [];
		const { service, events, mutex } = buildScheduler();
		service.registerTask(cronTask('expiredRoomsGC', runs));

		events.emitReady();
		await flush();

		expect(mutex.ttls).toEqual([ms('1h') - ms('1m')]);
	});

	it('keeps a cron task running past its first execution', async () => {
		const runs: string[] = [];
		const { service, events } = buildScheduler();
		service.registerTask({ ...cronTask('everySecondGC', runs), scheduleOrDelay: '1s' });

		events.emitReady();
		await waitUntil(() => runs.length >= 2);

		expect(runs.length).toBeGreaterThanOrEqual(2);
	});

	it('does not fire a timeout task that was cancelled before its delay', async () => {
		const runs: string[] = [];
		const { service, events } = buildScheduler();
		service.registerTask({
			name: 'oneShot',
			type: 'timeout',
			scheduleOrDelay: '30ms',
			callback: async () => {
				runs.push('oneShot');
			}
		});
		events.emitReady();

		service.cancelTask('oneShot');
		await new Promise((resolve) => setTimeout(resolve, 80));

		expect(runs).toEqual([]);
		expect(service.scheduledNames()).toEqual([]);
	});

	it('does not re-arm a timeout task that already ran', async () => {
		const runs: string[] = [];
		const { service, events } = buildScheduler();
		service.registerTask({
			name: 'oneShot',
			type: 'timeout',
			scheduleOrDelay: '1ms',
			callback: async () => {
				runs.push('oneShot');
			}
		});

		events.emitReady();
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(runs).toEqual(['oneShot']);
		expect(service.registeredNames()).toEqual([]);
		expect(service.scheduledNames()).toEqual([]);

		events.emitDisconnected();
		events.emitReady();
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(runs).toEqual(['oneShot']);
	});
});

describe('TaskSchedulerService cron expressions', () => {
	const schedules: [ms.StringValue, string][] = [
		['3d', '0 0 */3 * *'],
		['2h', '0 0 */2 * * *'],
		['5m', '0 */5 * * * *'],
		['45s', '0 * * * * *'],
		['30s', '0 * * * * *'],
		['10s', '*/10 * * * * *'],
		['500ms', '*/1 * * * * *']
	];

	it.each(schedules)('runs a %s schedule on the cron expression %s', (schedule, cronExpression) => {
		const { service } = buildScheduler();

		expect(service.toCron(schedule)).toBe(cronExpression);
	});
});
