import { describe, expect, it } from '@jest/globals';
import type { MeetRoom, MeetRoomMember, MeetRoomMemberPermissions, MeetRoomRoles } from '@openvidu-meet/typings';
import {
	memberToWire,
	roomToWire,
	withDeprecatedPermissionAliases
} from '../../src/helpers/permission-naming.helper.js';

// withDeprecatedPermissionAliases() is the single serializer shared by the REST exit points and the
// outgoing webhook payloads (WebhookDispatcherService delegates to roomToWire). The webhook service
// itself cannot be imported standalone: its module graph is cyclic outside the DI container.

const moderatorPermissions: MeetRoomMemberPermissions = {
	recordingControl: true,
	recordingList: true,
	recordingPlay: true,
	recordingDownload: true,
	recordingDelete: true,
	meetingJoin: true,
	meetingRead: true,
	roomShareAccessLinks: true,
	participantPromote: true,
	participantKick: true,
	participantMute: true,
	meetingEnd: true,
	mediaPublishVideo: true,
	mediaPublishAudio: true,
	mediaShareScreen: true,
	chatRead: true,
	chatWrite: true,
	mediaChangeVirtualBackground: true
};

// The split recording group is deliberately partial (list+play without download), so the AND
// collapse of its deprecated flag is observable.
const speakerPermissions: MeetRoomMemberPermissions = {
	...moderatorPermissions,
	recordingControl: false,
	recordingDownload: false,
	recordingDelete: false,
	roomShareAccessLinks: false,
	participantPromote: false,
	participantKick: false,
	meetingEnd: false
};

const buildRoles = (): MeetRoomRoles => ({
	moderator: { permissions: { ...moderatorPermissions } },
	speaker: { permissions: { ...speakerPermissions } }
});

type WirePermissions = Record<string, boolean>;

const asWireRoles = (roles: MeetRoomRoles) =>
	roles as unknown as {
		moderator: { permissions: WirePermissions };
		speaker: { permissions: WirePermissions };
	};

/**
 * Contract of the wire serializer shared by REST responses and webhook payloads
 * (meetingStarted/meetingEnded ship the whole MeetRoom through the same function): permissions
 * carry BOTH key sets. This whole suite is removed in 3.12.0 together with the deprecated spellings.
 */
describe('Wire permission naming', () => {
	describe('withDeprecatedPermissionAliases (shared by REST and webhooks)', () => {
		it('should add the deprecated spellings next to the current keys', () => {
			const wire = withDeprecatedPermissionAliases(moderatorPermissions) as WirePermissions;

			expect(wire.recordingControl).toBe(true);
			expect(wire.canRecord).toBe(true);
			expect(wire.canRetrieveRecordings).toBe(true);
		});

		it('should collapse the split recording group with AND', () => {
			const wire = withDeprecatedPermissionAliases(speakerPermissions) as WirePermissions;

			expect(wire.recordingList).toBe(true);
			expect(wire.recordingPlay).toBe(true);
			expect(wire.recordingDownload).toBe(false);
			expect(wire.canRetrieveRecordings).toBe(false);
		});

		it('should omit the deprecated flag of an incomplete split group', () => {
			const wire = withDeprecatedPermissionAliases({ recordingPlay: true }) as WirePermissions;

			expect(wire).toEqual({ recordingPlay: true });
		});
	});

	describe('REST exit points', () => {
		it('should serialize room roles with both key sets', () => {
			const room = { roomId: 'naming-room', roles: buildRoles() } as unknown as MeetRoom;

			const wire = asWireRoles(roomToWire(room).roles!);

			expect(wire.moderator.permissions.canRecord).toBe(true);
			expect(wire.speaker.permissions.recordingControl).toBe(false);
			expect(wire.speaker.permissions.canRecord).toBe(false);
		});

		it('should serialize member permissions with both key sets', () => {
			const member = {
				memberId: 'naming-member',
				customPermissions: { recordingControl: true },
				effectivePermissions: { ...speakerPermissions }
			} as unknown as MeetRoomMember;

			const wire = memberToWire(member) as unknown as {
				customPermissions: WirePermissions;
				effectivePermissions: WirePermissions;
			};

			expect(wire.customPermissions).toEqual({ recordingControl: true, canRecord: true });
			expect(wire.effectivePermissions.canRetrieveRecordings).toBe(false);
		});

		it('should pass objects without permission fields through untouched', () => {
			const room = { roomId: 'naming-room' } as unknown as MeetRoom;
			const member = { memberId: 'naming-member' } as unknown as MeetRoomMember;

			expect(roomToWire(room)).toBe(room);
			expect(memberToWire(member)).toEqual(member);
		});
	});
});
