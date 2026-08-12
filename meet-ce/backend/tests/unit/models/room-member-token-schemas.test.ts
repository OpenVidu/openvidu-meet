import { describe, expect, it } from '@jest/globals';
import type { MeetRoomMemberPermissions } from '@openvidu-meet/typings';
import { MEET_PERMISSION_KEYS, MeetRoomMemberUIBadge } from '@openvidu-meet/typings';
import {
	RoomMemberTokenMetadataSchema,
	RoomMemberTokenOptionsSchema
} from '../../../src/models/zod-schemas/room-member.schema.js';

const allPermissions = Object.fromEntries(
	MEET_PERMISSION_KEYS.map((key) => [key, true])
) as unknown as MeetRoomMemberPermissions;

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

	it('rejects a participantMetadata payload over 2 KB', () => {
		const result = RoomMemberTokenOptionsSchema.safeParse({ participantMetadata: 'x'.repeat(2049) });

		expect(result.success).toBe(false);
		expect(firstIssue(result).path).toEqual(['participantMetadata']);
		expect(firstIssue(result).message).toContain('cannot exceed 2048 characters');
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
