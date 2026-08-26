import { describe, expect, it } from '@jest/globals';
import type { MeetWebhook, MeetWebhookOptions } from '@openvidu-meet/typings';
import '../../../src/config/dependency-injector.config.js';
import { setInternalConfig } from '../../../src/config/internal-config.js';
import { OpenViduMeetError } from '../../../src/models/error.model.js';
import { WebhookRegistryService } from '../../../src/services/webhook-registry.service.js';

/**
 * Real in-memory stand-in for WebhookRepository: count() and create() are genuine async
 * operations over shared state, with an artificial delay on create() so two concurrent
 * createWebhook() calls interleave the same way two concurrent Mongo requests would — both
 * counting before either's insert commits.
 */
class FakeWebhookRepository {
	documents: MeetWebhook[] = [];

	async count(): Promise<number> {
		return this.documents.length;
	}

	async create(webhook: MeetWebhook): Promise<MeetWebhook> {
		await new Promise((resolve) => setTimeout(resolve, 10));
		this.documents.push(webhook);
		return webhook;
	}
}

/** Genuine mutual exclusion (an in-process queue), standing in for the real Redis-backed MutexService. */
class FakeMutexService {
	private locked = false;
	private waiters: Array<() => void> = [];

	async withLock<T>(_key: string, _ttl: number, callback: () => Promise<T>): Promise<T | null> {
		await this.acquire();

		try {
			return await callback();
		} finally {
			this.release();
		}
	}

	private acquire(): Promise<void> {
		if (!this.locked) {
			this.locked = true;
			return Promise.resolve();
		}

		return new Promise((resolve) => this.waiters.push(resolve));
	}

	private release(): void {
		const next = this.waiters.shift();

		if (next) {
			next();
		} else {
			this.locked = false;
		}
	}
}

const noopLogger = { info: () => {}, warn: () => {}, debug: () => {}, error: () => {}, verbose: () => {} };

describe('WebhookRegistryService.createWebhook (registration count-then-create race)', () => {
	it('never lets two concurrent registrations both slip past the cap', async () => {
		setInternalConfig({ WEBHOOK_MAX_ENDPOINTS: 1 });

		try {
			const repository = new FakeWebhookRepository();
			const service = new WebhookRegistryService(
				...([noopLogger, repository, {}, new FakeMutexService()] as unknown as ConstructorParameters<
					typeof WebhookRegistryService
				>)
			);

			const options: MeetWebhookOptions = { url: 'https://example.com/hook' };
			const results = await Promise.allSettled([
				service.createWebhook(options),
				service.createWebhook(options)
			]);

			const fulfilled = results.filter((result) => result.status === 'fulfilled');
			const rejected = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');

			expect(repository.documents).toHaveLength(1);
			expect(fulfilled).toHaveLength(1);
			expect(rejected).toHaveLength(1);
			expect(rejected[0].reason).toBeInstanceOf(OpenViduMeetError);
			expect((rejected[0].reason as OpenViduMeetError).statusCode).toBe(409);
			expect((rejected[0].reason as OpenViduMeetError).message).toContain('maximum number');
		} finally {
			setInternalConfig({ WEBHOOK_MAX_ENDPOINTS: 10 });
		}
	});
});
