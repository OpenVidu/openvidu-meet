import { describe, expect, it } from '@jest/globals';
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
 * The ending-soon warning has to reach every participant of the meeting, so it goes out with no
 * destinationIdentities filter.
 */
describe('FrontendEventService.sendMeetingEndingSoonSignal', () => {
	it('broadcasts to every participant in the room', async () => {
		const livekitService = new FakeLiveKitService();
		const service = buildService(livekitService);

		await service.sendMeetingEndingSoonSignal('room-1', 300_000);

		expect(livekitService.calls).toEqual([
			{
				roomName: 'room-1',
				rawData: { roomId: 'room-1', remainingMs: 300_000, timestamp: expect.any(Number) },
				topic: MeetSignalType.MEET_MEETING_ENDING_SOON
			}
		]);
	});
});
