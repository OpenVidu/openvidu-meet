import { describe, expect, it } from '@jest/globals';
import { runConcurrently } from '../../../src/utils/concurrency.utils.js';

describe('runConcurrently', () => {
	it('returns one settled result per item, in input order', async () => {
		const failure = new Error('boom');

		const results = await runConcurrently(
			['first', 'failing', 'last'],
			async (item) => {
				if (item === 'failing') {
					throw failure;
				}

				return item.toUpperCase();
			},
			{ concurrency: 2 }
		);

		expect(results).toEqual([
			{ status: 'fulfilled', value: 'FIRST' },
			{ status: 'rejected', reason: failure },
			{ status: 'fulfilled', value: 'LAST' }
		]);
	});

	it('rejects with the first error instead of settling when failFast is set', async () => {
		const failure = new Error('boom');

		const run = runConcurrently(
			['first', 'failing', 'last'],
			async (item) => {
				if (item === 'failing') {
					throw failure;
				}

				return item.toUpperCase();
			},
			{ concurrency: 2, failFast: true }
		);

		await expect(run).rejects.toBe(failure);
	});

	it('resolves to an empty array without calling the worker for no items', async () => {
		let calls = 0;

		const results = await runConcurrently(
			[],
			async () => {
				calls++;
			},
			{ concurrency: 2 }
		);

		expect(results).toEqual([]);
		expect(calls).toBe(0);
	});

	it('never runs more workers at once than the configured concurrency', async () => {
		let running = 0;
		let mostRunningAtOnce = 0;

		await runConcurrently(
			[1, 2, 3, 4, 5, 6],
			async () => {
				running++;
				mostRunningAtOnce = Math.max(mostRunningAtOnce, running);
				await new Promise((resolve) => setTimeout(resolve, 10));
				running--;
			},
			{ concurrency: 2 }
		);

		expect(mostRunningAtOnce).toBe(2);
	});
});
