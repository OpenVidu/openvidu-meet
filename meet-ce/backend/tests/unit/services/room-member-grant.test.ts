import { describe, expect, it } from '@jest/globals';
import type { MeetRoomMemberPermissions } from '@openvidu-meet/typings';
import { MEET_PERMISSION_KEYS } from '@openvidu-meet/typings';
// The service modules form a cycle through the DI container module, so it has to be the one that
// starts the graph (see meeting-mute.test.ts).
import '../../../src/config/dependency-injector.config.js';
import type { LiveKitPermissions } from '@openvidu-meet/typings';
import { RoomMemberService } from '../../../src/services/room-member.service.js';

// getLiveKitPermissions is protected; this exposes it. The constructor body is empty (it only stores
// the injected dependencies), so the grant builder can be exercised with no real dependencies.
class TestableRoomMemberService extends RoomMemberService {
	buildGrant(roomId: string, permissions: MeetRoomMemberPermissions): LiveKitPermissions {
		return this.getLiveKitPermissions(roomId, permissions);
	}
}

const service = new TestableRoomMemberService(
	...(Array.from({ length: 10 }, () => ({})) as unknown as ConstructorParameters<typeof RoomMemberService>)
);

const permissionsWith = (overrides: Partial<MeetRoomMemberPermissions>): MeetRoomMemberPermissions =>
	({
		...(Object.fromEntries(MEET_PERMISSION_KEYS.map((key) => [key, false])) as unknown as MeetRoomMemberPermissions),
		...overrides
	}) as MeetRoomMemberPermissions;

/**
 * The room-member join grant must not let a participant rewrite its own LiveKit metadata. Meet reads
 * that metadata server-side for a participant's role, externalId and application metadata (webhooks,
 * `GET /meetings/{roomId}/participants`) and for who is exempt from moderation — so a writable grant
 * lets any participant forge their own identity there (finding E1) and, through the token refresh
 * path, escalate to moderator (finding P1). The one legitimate client write, the display name, does
 * not need this grant: the name is carried in the signed token.
 */
describe('RoomMemberService LiveKit grant (identity cannot be self-forged)', () => {
	it('does not grant canUpdateOwnMetadata', () => {
		const grant = service.buildGrant('room-abc', permissionsWith({ mediaPublishAudio: true }));

		expect(grant.canUpdateOwnMetadata).toBe(false);
	});

	it('still grants the media capabilities the permissions imply', () => {
		// Pins that withholding the metadata write does not disturb the rest of the grant.
		const grant = service.buildGrant('room-abc', permissionsWith({ mediaPublishVideo: true, chatWrite: true }));

		expect(grant.roomJoin).toBe(true);
		expect(grant.canPublish).toBe(true);
		expect(grant.canPublishData).toBe(true);
		expect(grant.canSubscribe).toBe(true);
	});
});
