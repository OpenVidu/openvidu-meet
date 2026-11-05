import { beforeAll, describe, expect, it } from '@jest/globals';
import type { MeetRoomMemberPermissions } from '@openvidu-meet/typings';
import { MEET_PERMISSION_KEYS, MeetRoomMemberUIBadge } from '@openvidu-meet/typings';
import { configureZodErrorMessages } from '../../../src/config/zod-config.js';
import {
	RoomMemberTokenMetadataSchema,
	RoomMemberTokenOptionsSchema
} from '../../../src/models/zod-schemas/room-member.schema.js';

const allPermissions = Object.fromEntries(
	MEET_PERMISSION_KEYS.map((key) => [key, true])
) as unknown as MeetRoomMemberPermissions;

beforeAll(() => {
	configureZodErrorMessages();
});

const firstIssue = (result: { success: boolean; error?: { issues: Array<{ path: unknown[]; message: string }> } }) =>
	result.error!.issues[0];

describe('RoomMemberTokenOptionsSchema — participant identity correlation fields', () => {
	it('accepts a request without the optional correlation fields', () => {
		const result = RoomMemberTokenOptionsSchema.safeParse({ secret: 'abc' });

		expect(result.success).toBe(true);
	});

	it('accepts values at the documented boundaries', () => {
		const result = RoomMemberTokenOptionsSchema.safeParse({
			participantExternalId: 'a'.repeat(64),
			participantMetadata: 'x'.repeat(2048)
		});

		expect(result.success).toBe(true);
	});

	it('rejects an empty or too-long participantExternalId', () => {
		let result = RoomMemberTokenOptionsSchema.safeParse({ participantExternalId: '' });
		expect(result.success).toBe(false);
		expect(firstIssue(result).path).toEqual(['participantExternalId']);

		result = RoomMemberTokenOptionsSchema.safeParse({ participantExternalId: 'a'.repeat(65) });
		expect(result.success).toBe(false);
		expect(firstIssue(result).message).toContain('cannot exceed 64 characters');
	});

	it('rejects a participantExternalId with characters outside the documented alphabet', () => {
		for (const invalid of ['user 42', 'josé', 'user/42', 'user.42']) {
			const result = RoomMemberTokenOptionsSchema.safeParse({ participantExternalId: invalid });

			expect(result.success).toBe(false);
			expect(firstIssue(result).path).toEqual(['participantExternalId']);
		}
	});

	it('rejects a participantMetadata payload over 2048 bytes', () => {
		const result = RoomMemberTokenOptionsSchema.safeParse({ participantMetadata: 'x'.repeat(2049) });

		expect(result.success).toBe(false);
		expect(firstIssue(result).path).toEqual(['participantMetadata']);
		expect(firstIssue(result).message).toContain('cannot exceed 2048 bytes');
	});

	it('rejects a multibyte participantMetadata within 2048 characters but over 2048 UTF-8 bytes', () => {
		// '€' is one UTF-16 code unit (a plain .length/.max() count would let this through) but three
		// UTF-8 bytes, so 2048 of them are 6144 bytes — well over the documented limit.
		const result = RoomMemberTokenOptionsSchema.safeParse({ participantMetadata: '€'.repeat(2048) });

		expect(result.success).toBe(false);
		expect(firstIssue(result).path).toEqual(['participantMetadata']);
	});

	it('accepts a multibyte participantMetadata within the 2048-byte limit', () => {
		const result = RoomMemberTokenOptionsSchema.safeParse({ participantMetadata: '€'.repeat(682) });

		expect(result.success).toBe(true);
	});
});

describe('RoomMemberTokenMetadataSchema — round-trip of the correlation fields', () => {
	const baseMetadata = {
		iat: 1_620_000_000_000,
		roomId: 'room-abc',
		permissions: allPermissions,
		badge: MeetRoomMemberUIBadge.OTHER
	};

	it('keeps externalId and metadata through a parse round trip', () => {
		// Regression guard for the refresh/promotion paths: this schema strips undeclared keys, so a
		// field missing from it would silently disappear from the participant on every token refresh.
		const result = RoomMemberTokenMetadataSchema.safeParse({
			...baseMetadata,
			externalId: 'crm-user_42',
			metadata: '{"plan":"premium"}'
		});

		expect(result.success).toBe(true);
		expect(result.data?.externalId).toBe('crm-user_42');
		expect(result.data?.metadata).toBe('{"plan":"premium"}');
	});

	it('still accepts token metadata without the correlation fields', () => {
		const result = RoomMemberTokenMetadataSchema.safeParse(baseMetadata);

		expect(result.success).toBe(true);
		expect(result.data?.externalId).toBeUndefined();
		expect(result.data?.metadata).toBeUndefined();
	});
});

describe('RoomMemberTokenOptionsSchema basics', () => {
	it('does not join the meeting unless asked to', () => {
		expect(RoomMemberTokenOptionsSchema.parse({})).toEqual({ joinMeeting: false });
		expect(RoomMemberTokenOptionsSchema.parse({ joinMeeting: true }).joinMeeting).toBe(true);
	});

	it('keeps the secret, the participant name, the external id and the metadata as given', () => {
		const options = {
			secret: 'abc',
			joinMeeting: true,
			participantName: 'Alice',
			participantExternalId: 'crm_42-x',
			participantMetadata: '{"plan":"premium"}'
		};

		expect(RoomMemberTokenOptionsSchema.parse(options)).toEqual(options);
	});

	it('rejects a joinMeeting that is not a boolean', () => {
		const result = RoomMemberTokenOptionsSchema.safeParse({ joinMeeting: 'true' });

		expect(result.error!.issues.map(({ path, message }) => `${path.join('.')}: ${message}`)).toEqual([
			'joinMeeting: Expected boolean, received string'
		]);
	});

	it('names the rule an external id breaks', () => {
		const messages = (value: string) =>
			RoomMemberTokenOptionsSchema.safeParse({ participantExternalId: value }).error!.issues.map(
				({ message }) => message
			);

		expect(messages('')).toContain('participantExternalId cannot be empty');
		expect(messages('a'.repeat(65))).toEqual(['participantExternalId cannot exceed 64 characters']);
		expect(messages('a b')).toEqual([
			'participantExternalId must contain only letters, digits, underscores and hyphens'
		]);
		expect(RoomMemberTokenOptionsSchema.safeParse({ participantExternalId: 'Az09_-' }).success).toBe(true);
	});

	it('names the rule the metadata breaks, and accepts empty metadata', () => {
		const result = RoomMemberTokenOptionsSchema.safeParse({ participantMetadata: 'x'.repeat(2049) });

		expect(result.error!.issues.map(({ message }) => message)).toEqual([
			'participantMetadata cannot exceed 2048 bytes'
		]);
		expect(RoomMemberTokenOptionsSchema.safeParse({ participantMetadata: '' }).success).toBe(true);
	});
});

describe('RoomMemberTokenMetadataSchema fields', () => {
	const base = { iat: 1, roomId: 'room-abc', permissions: allPermissions, badge: MeetRoomMemberUIBadge.OWNER };
	const issuesOf = (input: unknown) =>
		RoomMemberTokenMetadataSchema.safeParse(input).error?.issues.map(
			({ path, message }) => `${path.join('.')}: ${message}`
		) ?? [];

	it('keeps every field a token carries', () => {
		const metadata = {
			...base,
			issuedAfterRevocation: 2,
			memberId: 'm1',
			userId: 'u1',
			isPromotedModerator: true,
			livekitUrl: 'wss://livekit.example.com',
			externalId: 'x',
			metadata: 'm'
		};

		expect(RoomMemberTokenMetadataSchema.parse(metadata)).toEqual(metadata);
	});

	it('requires the issue time, the room, the permissions and the badge', () => {
		expect(issuesOf({})).toEqual(['iat: Required', 'roomId: Required', 'permissions: Required', 'badge: Required']);
	});

	it('rejects a badge that does not exist and a livekit url that is not a URL', () => {
		expect(issuesOf({ ...base, badge: 'king' })).toEqual([
			"badge: Invalid enum value. Expected 'owner' | 'admin' | 'moderator' | 'other', received 'king'"
		]);
		expect(issuesOf({ ...base, livekitUrl: 'not a url' })).toEqual(['livekitUrl: LiveKit URL must be a valid URL']);
	});

	it('normalizes deprecated permission names and completes the keys that had none', () => {
		const deprecated = { canRecord: true, canRetrieveRecordings: true, canDeleteRecordings: true };
		const full = Object.fromEntries(
			[
				'canJoinMeeting',
				'canShareAccessLinks',
				'canMakeModerator',
				'canKickParticipants',
				'canEndMeeting',
				'canPublishVideo',
				'canPublishAudio',
				'canShareScreen',
				'canReadChat',
				'canWriteChat',
				'canChangeVirtualBackground'
			].map((key) => [key, false])
		);
		const parsed = RoomMemberTokenMetadataSchema.parse({ ...base, permissions: { ...deprecated, ...full } });

		expect(parsed.permissions.recordingControl).toBe(true);
		expect(parsed.permissions.recordingPlay).toBe(true);
		expect(parsed.permissions.meetingRead).toBe(false);
		expect(parsed.permissions.participantReactionSend).toBe(true);
		expect(Object.keys(parsed.permissions).sort()).toEqual([...MEET_PERMISSION_KEYS].sort());
	});

	it('rejects permissions that leave a current key undefined', () => {
		expect(issuesOf({ ...base, permissions: { chatRead: true } })).toContain(
			"permissions.chatWrite: Missing permission 'chatWrite'"
		);
	});
});
