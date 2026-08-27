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
 * C7 (MEET-BRANCH-AUDIT-FINDINGS.md): the moderator's own endMeeting request broadcasts this signal
 * before the room actually closes, so a client that locally attributed an earlier ending-soon
 * warning to the duration limit can correct itself before it sees the room disconnect.
 */
describe('FrontendEventService.sendMeetingEndedByModeratorSignal (C7)', () => {
	it('broadcasts to every participant in the room (no destinationIdentities filter)', async () => {
		const livekitService = new FakeLiveKitService();
		const service = buildService(livekitService);

		await service.sendMeetingEndedByModeratorSignal('room-1');

		expect(livekitService.calls).toEqual([
			{
				roomName: 'room-1',
				rawData: { roomId: 'room-1', timestamp: expect.any(Number) },
				topic: MeetSignalType.MEET_MEETING_ENDED_BY_MODERATOR
			}
		]);
	});
});
