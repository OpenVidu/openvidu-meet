import { describe, expect, it } from '@jest/globals';
import { MeetMeetingEndedCause } from '@openvidu-meet/typings';
// The service modules form a cycle through the DI container module, so it has to be the one that
// starts the graph (see migration.service.test.ts).
import '../../../src/config/dependency-injector.config.js';
import { LivekitWebhookService } from '../../../src/services/livekit-webhook.service.js';

class FakeRedisService {
	store = new Map<string, string>();

	async get(key: string): Promise<string | null> {
		return this.store.get(key) ?? null;
	}

	async set(key: string, value: string): Promise<string> {
		this.store.set(key, value);
		return 'OK';
	}
}

class TestableLivekitWebhookService extends LivekitWebhookService {
	runGetMeetingEndedCause(roomId: string, meetingId: string): Promise<MeetMeetingEndedCause | undefined> {
		return this.getMeetingEndedCause(roomId, meetingId);
	}
}

const buildService = (redis: FakeRedisService) =>
	new TestableLivekitWebhookService(
		...([{}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, redis, {}] as unknown as ConstructorParameters<
			typeof LivekitWebhookService
		>)
	);

/**
 * C7 (MEET-BRANCH-AUDIT-FINDINGS.md): getMeetingEndedCause is the read side of the
 * MEETING_ENDED_CAUSE flag RoomScheduledTasksService.markMeetingEndedByDurationLimit stamps before
 * force-ending a meeting for exceeding its duration limit — it decides whether the meetingEnded
 * webhook gets an attributed cause instead of reading as a moderator's own end.
 */
describe('LivekitWebhookService.getMeetingEndedCause — C7: attributing a force-end to the duration GC', () => {
	it('is undefined when no flag was ever set (a normal end)', async () => {
		const service = buildService(new FakeRedisService());

		await expect(service.runGetMeetingEndedCause('room-1', 'sid-N')).resolves.toBeUndefined();
	});

	it('is MAX_DURATION_REACHED when the flag matches the finishing meeting', async () => {
		const redis = new FakeRedisService();
		await redis.set('ov_meet:meeting_ended_cause:room-1', 'sid-N');
		const service = buildService(redis);

		await expect(service.runGetMeetingEndedCause('room-1', 'sid-N')).resolves.toBe(
			MeetMeetingEndedCause.MAX_DURATION_REACHED
		);
	});

	it('is undefined when the flag belongs to a different (stale) meeting in the same room', async () => {
		const redis = new FakeRedisService();
		await redis.set('ov_meet:meeting_ended_cause:room-1', 'sid-OLD');
		const service = buildService(redis);

		await expect(service.runGetMeetingEndedCause('room-1', 'sid-NEW')).resolves.toBeUndefined();
	});
});
