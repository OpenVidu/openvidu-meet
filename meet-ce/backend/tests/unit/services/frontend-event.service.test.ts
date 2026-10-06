import { describe, expect, it } from '@jest/globals';
// The service modules form a cycle through the DI container module, so it has to be the one that
// starts the graph (see migration.service.test.ts).
import '../../../src/config/dependency-injector.config.js';
import { FrontendEventService } from '../../../src/services/frontend-event.service.js';

const noopLogger = { info: () => {}, warn: () => {}, debug: () => {}, error: () => {}, verbose: () => {} };

class UnreachableLiveKitService {
	async sendData(): Promise<void> {
		throw new Error('LiveKit unreachable');
	}
}

/**
 * A signal reports a change the server has already applied, so failing to deliver it must not turn
 * that change into an error for whoever made it.
 */
describe('FrontendEventService signals that cannot be delivered', () => {
	const service = new FrontendEventService(
		...([noopLogger, new UnreachableLiveKitService()] as unknown as ConstructorParameters<
			typeof FrontendEventService
		>)
	);

	it('resolves the permissions updated signal', async () => {
		await expect(
			service.sendParticipantPermissionsUpdatedSignal('room-1', 'participant-1')
		).resolves.toBeUndefined();
	});

	it('resolves the media muted signal', async () => {
		await expect(
			service.sendParticipantMediaMutedSignal('room-1', ['participant-1'], { audioActive: false })
		).resolves.toBeUndefined();
	});
});
