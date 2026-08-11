import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import type { MeetRoom, MeetRoomMember, MeetRoomMemberPermissions, MeetRoomRoles } from '@openvidu-meet/typings';
import type { Response } from 'express';
import { PermissionNamingHelper, withDeprecatedPermissionAliases } from '../../src/helpers/permission-naming.helper.js';

// withDeprecatedPermissionAliases() is the single serializer shared by the REST exit points
// (PermissionNamingHelper) and the outgoing webhook payloads (OpenViduWebhookService.
// roomToWirePermissions guards on the same isCompatibilityMode() and delegates here) — the webhook
// service itself cannot be imported standalone, its module graph is cyclic outside the DI container.

const moderatorPermissions: MeetRoomMemberPermissions = {
	recordingControl: true,
	recordingList: true,
	recordingPlay: true,
	recordingDownload: true,
	recordingDelete: true,
	meetingJoin: true,
	roomShareAccessLinks: true,
	participantPromote: true,
	participantKick: true,
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

interface FakeResponse {
	res: Response;
	headers: Record<string, string>;
}

const buildResponse = (): FakeResponse => {
	const headers: Record<string, string> = {};
	const res = {
		headersSent: false,
		set: (name: string, value: string) => {
			headers[name] = value;
		}
	} as unknown as Response;

	return { res, headers };
};

/**
 * MEET_MODE contract of the wire serializer shared by REST responses and webhook payloads
 * (meetingStarted/meetingEnded ship the whole MeetRoom through the same function): in
 * `compatibility` permissions carry BOTH key sets and the response is stamped with
 * `Deprecation: true`; with `'3.9.0'` they carry only the current keys and no header. This whole
 * suite is removed in 3.12.0 together with the compatibility mode.
 */
describe('Wire permission naming (MEET_MODE)', () => {
	afterEach(() => {
		delete process.env.MEET_MODE;
	});

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

	describe('compatibility mode (default)', () => {
		it('should serialize room roles with both key sets and stamp Deprecation', () => {
			const { res, headers } = buildResponse();
			const room = { roomId: 'naming-room', roles: buildRoles() } as unknown as MeetRoom;

			const wire = asWireRoles(PermissionNamingHelper.roomToWire(room, res).roles!);

			expect(wire.moderator.permissions.canRecord).toBe(true);
			expect(wire.speaker.permissions.recordingControl).toBe(false);
			expect(wire.speaker.permissions.canRecord).toBe(false);
			expect(headers.Deprecation).toBe('true');
		});

		it('should serialize member permissions with both key sets and stamp Deprecation', () => {
			const { res, headers } = buildResponse();
			const member = {
				memberId: 'naming-member',
				customPermissions: { recordingControl: true },
				effectivePermissions: { ...speakerPermissions }
			} as unknown as MeetRoomMember;

			const wire = PermissionNamingHelper.memberToWire(member, res) as unknown as {
				customPermissions: WirePermissions;
				effectivePermissions: WirePermissions;
			};

			expect(wire.customPermissions).toEqual({ recordingControl: true, canRecord: true });
			expect(wire.effectivePermissions.canRetrieveRecordings).toBe(false);
			expect(headers.Deprecation).toBe('true');
		});

		it('should not stamp Deprecation on objects without permission fields', () => {
			const { res, headers } = buildResponse();
			const room = { roomId: 'naming-room' } as unknown as MeetRoom;
			const member = { memberId: 'naming-member' } as unknown as MeetRoomMember;

			expect(PermissionNamingHelper.roomToWire(room, res)).toBe(room);
			expect(PermissionNamingHelper.memberToWire(member, res)).toBe(member);
			expect(headers.Deprecation).toBeUndefined();
		});
	});

	describe("MEET_MODE '3.9.0'", () => {
		beforeEach(() => {
			process.env.MEET_MODE = '3.9.0';
		});

		it('should pass everything through untouched, without Deprecation', () => {
			const { res, headers } = buildResponse();
			const room = { roomId: 'naming-room', roles: buildRoles() } as unknown as MeetRoom;
			const member = {
				memberId: 'naming-member',
				effectivePermissions: { ...moderatorPermissions }
			} as unknown as MeetRoomMember;

			const wireRoom = PermissionNamingHelper.roomToWire(room, res);
			const wireMember = PermissionNamingHelper.memberToWire(member, res);

			// The mode branch is the identity: same objects, no deprecated spellings added.
			expect(wireRoom).toBe(room);
			expect(wireMember).toBe(member);
			expect(asWireRoles(wireRoom.roles!).moderator.permissions).not.toHaveProperty('canRecord');
			expect(headers.Deprecation).toBeUndefined();
		});
	});
});
