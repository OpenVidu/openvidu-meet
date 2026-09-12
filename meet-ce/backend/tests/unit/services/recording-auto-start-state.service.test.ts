import { describe, expect, it } from '@jest/globals';
import type { MeetRoomMemberPermissions } from '@openvidu-meet/typings';
import {
	MEET_PERMISSION_KEYS,
	MEET_RECORDING_AUTO_START_PRESETS,
	MeetRecordingAutoStartMode,
	MeetRoomMemberUIBadge
} from '@openvidu-meet/typings';
import type { ParticipantInfo } from 'livekit-server-sdk';
// The service modules form a cycle through the DI container module, so it has to be the one that
// starts the graph (see migration.service.test.ts).
import '../../../src/config/dependency-injector.config.js';
import { RecordingAutoStartStateService } from '../../../src/services/recording-auto-start-state.service.js';

const noopLogger = { info: () => {}, warn: () => {}, debug: () => {}, error: () => {}, verbose: () => {} };

class FakeRedisService {
	store = new Map<string, string>();

	async get(key: string): Promise<string | null> {
		return this.store.get(key) ?? null;
	}

	async set(key: string, value: string): Promise<string> {
		this.store.set(key, value);
		return 'OK';
	}

	async delete(key: string): Promise<number> {
		return this.store.delete(key) ? 1 : 0;
	}

	async setExpiration(): Promise<boolean> {
		return true;
	}
}

const buildService = (redis: FakeRedisService) =>
	new RecordingAutoStartStateService(
		...([redis, noopLogger] as unknown as ConstructorParameters<typeof RecordingAutoStartStateService>)
	);

/**
 * B2 (MEET-BRANCH-AUDIT-FINDINGS.md): activateAutoStart used to DEL the room's disabled-flag key
 * unconditionally on `room_finished`, while the *read* side (isDisabled) already compares the
 * stored value against the current meeting's sid. A `room_finished` for meeting N, redelivered or
 * simply delayed past meeting N+1 starting in the same room, could wipe out N+1's own deliberate-stop
 * flag — the same "recording restarts after a manual stop" hazard B1 fixed, via a different path.
 */
describe("RecordingAutoStartStateService.activateAutoStart — B2: a late room_finished must not clear a later meeting's flag", () => {
	it('clears the flag when it belongs to the meeting that is actually finishing', async () => {
		const redis = new FakeRedisService();
		const service = buildService(redis);
		await service.markDisabled('room-1', 'sid-N');

		await service.activateAutoStart('room-1', 'sid-N');

		expect(await service.isDisabled('room-1', 'sid-N')).toBe(false);
	});

	it("leaves a later meeting's flag untouched when a stale room_finished for an earlier meeting arrives", async () => {
		const redis = new FakeRedisService();
		const service = buildService(redis);
		// Meeting N+1 already started in the same room and made its own deliberate stop...
		await service.markDisabled('room-1', 'sid-N+1');

		// ...then meeting N's room_finished (sid-N) finally arrives, redelivered/delayed.
		await service.activateAutoStart('room-1', 'sid-N');

		// N+1's flag must survive: auto-start stays disabled for N+1, exactly as that meeting chose.
		expect(await service.isDisabled('room-1', 'sid-N+1')).toBe(true);
	});

	it('is a no-op when there is no flag to clear', async () => {
		const redis = new FakeRedisService();
		const service = buildService(redis);

		await expect(service.activateAutoStart('room-1', 'sid-N')).resolves.toBeUndefined();
		expect(redis.store.size).toBe(0);
	});
});

/**
 * B10 (MEET-BRANCH-AUDIT-FINDINGS.md): a promotion evaluates the threshold with the triggering
 * participant already in the listing, under the role LiveKit has not published back yet. The
 * participant handed to the check is the authority on their own role.
 */
describe('RecordingAutoStartStateService.hasReachedAutoStartThreshold — the candidate is counted exactly once', () => {
	const permissions = Object.fromEntries(
		MEET_PERMISSION_KEYS.map((key) => [key, false])
	) as unknown as MeetRoomMemberPermissions;

	const participant = (identity: string, badge: MeetRoomMemberUIBadge): ParticipantInfo =>
		({
			identity,
			metadata: JSON.stringify({ iat: Date.now(), roomId: 'room-1', permissions, badge })
		}) as ParticipantInfo;

	const whenModeratorJoins = MEET_RECORDING_AUTO_START_PRESETS[MeetRecordingAutoStartMode.WHEN_MODERATOR_JOINS];
	const whenSecondParticipantJoins =
		MEET_RECORDING_AUTO_START_PRESETS[MeetRecordingAutoStartMode.WHEN_SECOND_PARTICIPANT_JOINS];

	const service = buildService(new FakeRedisService());

	it('reads the role from the candidate, not from their stale entry in the listing', () => {
		const promoted = participant('speaker-1', MeetRoomMemberUIBadge.MODERATOR);
		const listing = [participant('speaker-1', MeetRoomMemberUIBadge.OTHER)];

		expect(service.hasReachedAutoStartThreshold('room-1', whenModeratorJoins, promoted, listing)).toBe(true);
	});

	it('does not count a listed candidate twice', () => {
		const joiner = participant('speaker-1', MeetRoomMemberUIBadge.OTHER);

		expect(service.hasReachedAutoStartThreshold('room-1', whenSecondParticipantJoins, joiner, [joiner])).toBe(
			false
		);
	});

	it('counts a candidate the listing has not caught up with yet', () => {
		const joiner = participant('speaker-2', MeetRoomMemberUIBadge.OTHER);
		const listing = [participant('speaker-1', MeetRoomMemberUIBadge.OTHER)];

		expect(service.hasReachedAutoStartThreshold('room-1', whenSecondParticipantJoins, joiner, listing)).toBe(true);
	});
});
