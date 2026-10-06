import { describe, expect, it } from '@jest/globals';
import type { MeetRoom } from '@openvidu-meet/typings';
import { MeetSignalType } from '@openvidu-meet/typings';
// The service modules form a cycle through the DI container module, so it has to be the one that
// starts the graph (see migration.service.test.ts).
import '../../../src/config/dependency-injector.config.js';
import { FrontendEventService } from '../../../src/services/frontend-event.service.js';

const noopLogger = { info: () => {}, warn: () => {}, debug: () => {}, error: () => {}, verbose: () => {} };

class FakeLiveKitService {
	calls: { roomName: string; rawData: unknown; topic?: string }[] = [];

	async sendData(roomName: string, rawData: unknown, options: { topic?: string }): Promise<void> {
		this.calls.push({ roomName, rawData, topic: options.topic });
	}
}

class UnreachableLiveKitService extends FakeLiveKitService {
	override async sendData(): Promise<void> {
		throw new Error('LiveKit unreachable');
	}
}

const buildService = (livekitService: FakeLiveKitService) =>
	new FrontendEventService(
		...([noopLogger, livekitService] as unknown as ConstructorParameters<typeof FrontendEventService>)
	);

/**
 * A room-wide signal has to reach every participant of the meeting, so it goes out with no
 * destinationIdentities filter.
 */
describe('FrontendEventService.sendRoomConfigUpdatedSignal', () => {
	it('broadcasts to every participant in the room', async () => {
		const livekitService = new FakeLiveKitService();
		const service = buildService(livekitService);
		const config = { chat: { enabled: true } };

		await service.sendRoomConfigUpdatedSignal('room-1', { config } as unknown as MeetRoom);

		expect(livekitService.calls).toEqual([
			{
				roomName: 'room-1',
				rawData: { roomId: 'room-1', config, timestamp: expect.any(Number) },
				topic: MeetSignalType.MEET_ROOM_CONFIG_UPDATED
			}
		]);
	});
});

/**
 * A signal reports a change the server has already applied, so failing to deliver it must not turn
 * that change into an error for whoever made it.
 */
describe('FrontendEventService signals that cannot be delivered', () => {
	const service = buildService(new UnreachableLiveKitService());

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
