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
