import { describe, expect, it, jest } from '@jest/globals';
import type { WaitingRoomSweepTick } from '../../../src/models/waiting-room.model.js';
import type { IScheduledTask } from '../../../src/models/task-scheduler.model.js';
import { WaitingRoomSweepTask } from '../../../src/services/waiting-room/waiting-room-sweep.task.js';

const SECOND = 1000;
const UNSEEN_TIMEOUT = 60 * SECOND;

/**
 * Redis as the sweep and the presence of each connection see it: one clock, the last time each wait
 * was seen, and the sweep's own record of its passes. Expiring re-checks staleness, as the script does.
 */
class ClockedRedis {
	now = 1_800_000_000_000;
	seen = new Map<string, number>();
	expired: string[] = [];
	private lastRun?: number;
	private gapAt?: number;

	presence(waitId: string): void {
		this.seen.set(waitId, this.now);
	}

	async sweep(): Promise<WaitingRoomSweepTick> {
		const tick = {
			now: this.now,
			lastRun: this.lastRun,
			gapAt: this.gapAt,
			due: [...this.seen]
				.filter(([, seenAt]) => seenAt <= this.now - UNSEEN_TIMEOUT)
				.map(([waitId]) => ({ roomId: 'room-1', waitId }))
		};
		this.lastRun = this.now;
		return tick;
	}

	async recordSweepGap(at: number): Promise<void> {
		this.gapAt = at;
	}

	async expire(_roomId: string, waitIds: string[]): Promise<void> {
		for (const waitId of waitIds) {
			if (this.seen.get(waitId)! <= this.now - UNSEEN_TIMEOUT) {
				this.seen.delete(waitId);
				this.expired.push(waitId);
			}
		}
	}
}

const build = () => {
	const redis = new ClockedRedis();
	const tasks: IScheduledTask[] = [];
	const warn = jest.fn();
	const sweepTask = new WaitingRoomSweepTask(
		...([
			redis,
			{ expire: (roomId: string, waitIds: string[]) => redis.expire(roomId, waitIds) },
			{ registerTask: (task: IScheduledTask) => tasks.push(task) },
			{ warn, debug: () => {}, verbose: () => {}, info: () => {}, error: () => {} }
		] as unknown as ConstructorParameters<typeof WaitingRoomSweepTask>)
	);

	/** Moves the clock, the sweep running every 5 s and each live connection answering a ping every 20 s. */
	const run = async (forMs: number, connected: string[]) => {
		const end = redis.now + forMs;

		while (redis.now < end) {
			redis.now += 5 * SECOND;

			if (redis.now % (20 * SECOND) === 0) connected.forEach((waitId) => redis.presence(waitId));

			await sweepTask.sweep();
		}
	};

	return { redis, tasks, warn, sweepTask, run };
};

describe('WaitingRoomSweepTask', () => {
	it('runs every 5 seconds through the scheduler, once per cluster', () => {
		const { tasks } = build();

		expect(tasks).toEqual([
			expect.objectContaining({ name: 'waitingRoomSweep', type: 'cron', scheduleOrDelay: '5s' })
		]);
	});

	it('never expires a wait whose connection keeps answering, even after three hours', async () => {
		const { redis, run } = build();
		redis.presence('wait-ana');

		await run(3 * 60 * 60 * SECOND, ['wait-ana']);

		expect(redis.expired).toEqual([]);
	});

	it('expires a wait about a minute after its connection stopped answering', async () => {
		const { redis, run } = build();
		redis.presence('wait-ana');
		redis.presence('wait-ben');

		await run(40 * SECOND, ['wait-ana', 'wait-ben']);
		const lastSeen = redis.seen.get('wait-ben')!;
		await run(55 * SECOND, ['wait-ana']);

		expect(redis.expired).toEqual([]);

		await run(10 * SECOND, ['wait-ana']);

		expect(redis.expired).toEqual(['wait-ben']);
		expect(redis.now - lastSeen).toBeLessThanOrEqual(UNSEEN_TIMEOUT + 5 * SECOND);
	});

	it('expires nobody on the pass after a pause longer than 15 s, nor on the passes within 25 s after it', async () => {
		const { redis, sweepTask, warn, run } = build();
		redis.presence('wait-ana');
		await run(20 * SECOND, ['wait-ana']);

		redis.now += 50 * SECOND + 2;
		redis.seen.set('wait-ana', redis.now - 70 * SECOND);
		await sweepTask.sweep();
		redis.now += 3;
		await sweepTask.sweep();

		expect(warn).toHaveBeenCalledTimes(1);
		expect(redis.expired).toEqual([]);

		redis.presence('wait-ana');
		await run(25 * SECOND, ['wait-ana']);

		expect(redis.expired).toEqual([]);
	});

	it('expires after the pause a wait whose connection did not come back', async () => {
		const { redis, sweepTask, run } = build();
		redis.presence('wait-ana');
		redis.presence('wait-ben');
		await run(20 * SECOND, ['wait-ana', 'wait-ben']);

		redis.now += 50 * SECOND;
		await sweepTask.sweep();
		redis.presence('wait-ana');
		await run(20 * SECOND, ['wait-ana']);

		expect(redis.expired).toEqual([]);

		await run(10 * SECOND, ['wait-ana']);

		expect(redis.expired).toEqual(['wait-ben']);
	});

	it('goes on with the other rooms when the waits of one cannot be expired', async () => {
		const { redis, sweepTask, warn } = build();
		const expired: string[] = [];
		Object.assign((sweepTask as unknown as { waitingRoomService: object }).waitingRoomService, {
			expire: async (roomId: string) => {
				if (roomId === 'room-1') throw new Error('Redis down');

				expired.push(roomId);
			}
		});
		redis.sweep = async () => ({
			now: redis.now,
			due: [
				{ roomId: 'room-1', waitId: 'wait-ana' },
				{ roomId: 'room-2', waitId: 'wait-ben' }
			]
		});

		await sweepTask.sweep();

		expect(expired).toEqual(['room-2']);
		expect(warn).toHaveBeenCalledTimes(1);
	});
});
