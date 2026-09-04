import { afterEach, describe, expect, it } from '@jest/globals';
// The service modules form a cycle through the DI container module, so it has to be the one that
// starts the graph (see room-scheduled-tasks.service.test.ts).
import '../../../src/config/dependency-injector.config.js';
import type { IScheduledTask } from '../../../src/models/task-scheduler.model.js';
import { TaskSchedulerService } from '../../../src/services/task-scheduler.service.js';

const noopLogger = { info: () => {}, warn: () => {}, debug: () => {}, error: () => {}, verbose: () => {} };

const flush = () => new Promise((resolve) => setImmediate(resolve));

class FakeDistributedEventService {
	private readyCallbacks: (() => void)[] = [];
	private disconnectedCallbacks: (() => void)[] = [];

	onRedisReady(callback: () => void): void {
		this.readyCallbacks.push(callback);
	}

	onRedisDisconnected(callback: () => void): void {
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
	async withLock<T>(_lockKey: string, _ttl: number, callback: () => Promise<T>): Promise<T | null> {
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
}

const cronTask = (name: string, runs: string[]): IScheduledTask => ({
	name,
	type: 'cron',
	scheduleOrDelay: '1h',
	callback: async () => {
		runs.push(name);
	}
});

const openSchedulers: { service: TestableTaskSchedulerService; events: FakeDistributedEventService }[] = [];

const buildScheduler = () => {
	const events = new FakeDistributedEventService();
	const service = new TestableTaskSchedulerService(
		...([noopLogger, events, new FakeMutexService()] as unknown as ConstructorParameters<
			typeof TaskSchedulerService
		>)
	);
	openSchedulers.push({ service, events });
	return { service, events };
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

		events.emitDisconnected();
		events.emitReady();
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(runs).toEqual(['oneShot']);
	});
});
