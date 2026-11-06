import { describe, expect, it } from '@jest/globals';
import type { MeetRoomMemberPermissions } from '@openvidu-meet/typings';
import { MEET_PERMISSION_KEYS, MeetRoomMemberUIBadge, TrackSource } from '@openvidu-meet/typings';
import type { LiveKitPermissions } from '@openvidu-meet/typings';
import { RoomMemberService } from '../../../src/services/room-member.service.js';

// getLiveKitPermissions is protected; this exposes it. The constructor body is empty (it only stores
// the injected dependencies), so the grant builder can be exercised with no real dependencies.
class TestableRoomMemberService extends RoomMemberService {
	buildGrant(roomId: string, permissions: MeetRoomMemberPermissions, chatEnabled = true): LiveKitPermissions {
		return this.getLiveKitPermissions(roomId, permissions, chatEnabled);
	}

	badgeFor(permissions: MeetRoomMemberPermissions, moderatorPermissions: MeetRoomMemberPermissions) {
		return this.resolveBadgeFromPermissions(permissions, moderatorPermissions);
	}
}

const service = new TestableRoomMemberService(
	...(Array.from({ length: 10 }, () => ({})) as unknown as ConstructorParameters<typeof RoomMemberService>)
);

const permissionsWith = (overrides: Partial<MeetRoomMemberPermissions>): MeetRoomMemberPermissions =>
	({
		...(Object.fromEntries(
			MEET_PERMISSION_KEYS.map((key) => [key, false])
		) as unknown as MeetRoomMemberPermissions),
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
		const grant = service.buildGrant(
			'room-abc',
			permissionsWith({ mediaPublishVideo: true, chatRead: true, chatWrite: true })
		);

		expect(grant.roomJoin).toBe(true);
		expect(grant.canPublish).toBe(true);
		expect(grant.canPublishData).toBe(true);
		expect(grant.canSubscribe).toBe(true);
	});
});

describe('RoomMemberService LiveKit grant (chat)', () => {
	it('denies publishing data when the room has chat disabled, whatever the chat permissions say', () => {
		const grant = service.buildGrant('room-abc', permissionsWith({ chatRead: true, chatWrite: true }), false);

		expect(grant.canPublishData).toBe(false);
	});

	it('allows publishing data when the room has chat enabled and chatRead and chatWrite are granted', () => {
		const grant = service.buildGrant('room-abc', permissionsWith({ chatRead: true, chatWrite: true }), true);

		expect(grant.canPublishData).toBe(true);
	});

	it('denies publishing data to a participant who can write but not read the chat', () => {
		const grant = service.buildGrant('room-abc', permissionsWith({ chatWrite: true }), true);

		expect(grant.canPublishData).toBe(false);
	});
});

describe('RoomMemberService LiveKit grant (media sources)', () => {
	it.each([
		[{}, false, []],
		[{ mediaPublishAudio: true }, true, [TrackSource.MICROPHONE]],
		[{ mediaPublishVideo: true }, true, [TrackSource.CAMERA]],
		[{ mediaShareScreen: true }, true, [TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO]],
		[
			{ mediaPublishAudio: true, mediaPublishVideo: true, mediaShareScreen: true },
			true,
			[TrackSource.MICROPHONE, TrackSource.CAMERA, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO]
		]
	])('lets permissions %j publish (%s) exactly the sources %j', (overrides, canPublish, sources) => {
		const grant = service.buildGrant('room-abc', permissionsWith(overrides));

		expect(grant.room).toBe('room-abc');
		expect(grant.canPublish).toBe(canPublish);
		expect(grant.canPublishSources).toEqual(sources);
	});
});

describe('RoomMemberService badge', () => {
	const moderator = permissionsWith({ participantKick: true, meetingEnd: true, chatWrite: true });

	it('shows a member holding every permission of the moderator role as a moderator', () => {
		expect(service.badgeFor(moderator, moderator)).toBe(MeetRoomMemberUIBadge.MODERATOR);
		expect(service.badgeFor(permissionsWith({ ...moderator, recordingDelete: true }), moderator)).toBe(
			MeetRoomMemberUIBadge.MODERATOR
		);
	});

	it('shows a member lacking any permission of the moderator role as another participant', () => {
		expect(service.badgeFor(permissionsWith({ ...moderator, meetingEnd: false }), moderator)).toBe(
			MeetRoomMemberUIBadge.OTHER
		);
	});
});
