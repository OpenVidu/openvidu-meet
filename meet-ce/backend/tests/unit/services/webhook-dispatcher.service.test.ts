import { describe, expect, it } from '@jest/globals';
import { MeetMeetingEndedReason, MeetWebhookEventType } from '@openvidu-meet/typings';
import type { MeetRoom, MeetWebhookPayload } from '@openvidu-meet/typings';
// The service modules form a cycle through the DI container module, so it has to be the one that
// starts the graph (see migration.service.test.ts).
import '../../../src/config/dependency-injector.config.js';
import { WebhookDispatcherService } from '../../../src/services/webhook-dispatcher.service.js';

class TestableWebhookDispatcherService extends WebhookDispatcherService {
	calls: { event: MeetWebhookEventType; payload: MeetWebhookPayload }[] = [];

	protected override sendWebhookEventInBackground(event: MeetWebhookEventType, payload: MeetWebhookPayload): void {
		this.calls.push({ event, payload });
	}
}

const buildService = () =>
	new TestableWebhookDispatcherService(
		...([{}, {}, {}] as unknown as ConstructorParameters<typeof WebhookDispatcherService>)
	);

const fakeRoom = { roomId: 'room-1', roomName: 'Room 1' } as MeetRoom;

/**
 * C7 (MEET-BRANCH-AUDIT-FINDINGS.md): reason is additive on the meetingEnded payload: absent for
 * every end path except the one that actually needs it (a force-end by the duration GC), so every
 * other integrator's parsing of this event is unaffected.
 */
describe('WebhookDispatcherService.sendMeetingEndedWebhook (C7: additive reason field)', () => {
	it('omits reason entirely for a normal end', () => {
		const service = buildService();

		service.sendMeetingEndedWebhook(fakeRoom);

		expect(service.calls).toEqual([{ event: MeetWebhookEventType.MEETING_ENDED, payload: fakeRoom }]);
		expect('reason' in service.calls[0].payload).toBe(false);
	});

	it('includes reason when the meeting was force-ended by the duration GC', () => {
		const service = buildService();

		service.sendMeetingEndedWebhook(fakeRoom, MeetMeetingEndedReason.MAX_DURATION_REACHED);

		expect(service.calls).toEqual([
			{
				event: MeetWebhookEventType.MEETING_ENDED,
				payload: { ...fakeRoom, reason: MeetMeetingEndedReason.MAX_DURATION_REACHED }
			}
		]);
	});
});
