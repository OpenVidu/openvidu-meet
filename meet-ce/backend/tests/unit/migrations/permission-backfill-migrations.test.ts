import { describe, expect, it } from '@jest/globals';
import type { MeetDeprecatedPermissionKey } from '@openvidu-meet/typings';
import { MEET_PERMISSION_ALIASES, MEET_PERMISSION_KEYS, MEET_UNALIASED_PERMISSION_KEYS } from '@openvidu-meet/typings';
import { generateSchemaMigrationName } from '../../../src/models/migration.model.js';
import type { MeetRoomMemberDocument } from '../../../src/models/mongoose-schemas/room-member.schema.js';
import { meetRoomMemberCollectionName } from '../../../src/models/mongoose-schemas/room-member.schema.js';
import type { MeetRoomDocument } from '../../../src/models/mongoose-schemas/room.schema.js';
import { meetRoomCollectionName } from '../../../src/models/mongoose-schemas/room.schema.js';
import { roomMemberMigrations } from '../../../src/migrations/room-member-migrations.js';
import { roomMigrations } from '../../../src/migrations/room-migrations.js';

/**
 * These migrations rename the stored `can*` permission keys and, in the same step, fill in the keys
 * added after that rename (MEET_UNALIASED_PERMISSION_KEYS) from the permission that used to govern the
 * same capability. The rename half is asserted against realistic legacy documents in the migration
 * integration suites; what is covered here is the backfill half, which must complete every stored
 * permission set — the sub-schema marks each current key required, so a missing one reads as denied and
 * fails validation on the next write — without turning a denied capability into a granted one.
 */

const roomV3ToV4 = roomMigrations.get(generateSchemaMigrationName(meetRoomCollectionName, 3, 4))!;
const roomMemberV1ToV2 = roomMemberMigrations.get(generateSchemaMigrationName(meetRoomMemberCollectionName, 1, 2))!;

// A permission set as it was stored before the rename: every deprecated key, granted unless overridden.
const legacyPermissions = (overrides: Partial<Record<MeetDeprecatedPermissionKey, boolean>> = {}) => {
	const permissions = {} as Record<MeetDeprecatedPermissionKey, boolean>;

	for (const key of Object.keys(MEET_PERMISSION_ALIASES) as MeetDeprecatedPermissionKey[]) {
		permissions[key] = true;
	}

	return { ...permissions, ...overrides };
};

const roomDocument = (moderator: Record<string, boolean>, speaker: Record<string, boolean>): MeetRoomDocument =>
	({
		roomId: 'room-123',
		roles: {
			moderator: { permissions: moderator },
			speaker: { permissions: speaker }
		}
	}) as unknown as MeetRoomDocument;

describe('Room migration v3 → v4', () => {
	it('should complete the role permissions with the keys added after the rename', () => {
		const migrated = roomV3ToV4(roomDocument(legacyPermissions(), legacyPermissions({ canJoinMeeting: false })));

		expect(Object.keys(migrated.roles.moderator.permissions).sort()).toEqual([...MEET_PERMISSION_KEYS].sort());
		expect(migrated.roles.moderator.permissions.meetingRead).toBe(true);
		// The speaker could not join, so it does not gain the ability to observe either.
		expect(migrated.roles.speaker.permissions.meetingJoin).toBe(false);
		expect(migrated.roles.speaker.permissions.meetingRead).toBe(false);
	});

	it('should leave no unaliased key undefined, whichever ones exist', () => {
		const migrated = roomV3ToV4(roomDocument(legacyPermissions(), legacyPermissions()));

		for (const key of MEET_UNALIASED_PERMISSION_KEYS) {
			expect(typeof migrated.roles.moderator.permissions[key]).toBe('boolean');
			expect(typeof migrated.roles.speaker.permissions[key]).toBe('boolean');
		}
	});
});

describe('Room member migration v1 → v2', () => {
	it('should complete effectivePermissions, which the schema requires in full', () => {
		const document = {
			memberId: 'member-123',
			effectivePermissions: legacyPermissions()
		} as unknown as MeetRoomMemberDocument;

		const migrated = roomMemberV1ToV2(document);

		expect(Object.keys(migrated.effectivePermissions).sort()).toEqual([...MEET_PERMISSION_KEYS].sort());
		expect(migrated.effectivePermissions.meetingRead).toBe(true);
	});

	it('should only extend an overlay where it already overrides the permission being inherited', () => {
		const untouched = {
			memberId: 'member-123',
			customPermissions: { canWriteChat: false },
			effectivePermissions: legacyPermissions()
		} as unknown as MeetRoomMemberDocument;

		// Nothing to inherit from: the member keeps deferring to its role for the new permission.
		expect(roomMemberV1ToV2(untouched).customPermissions).toEqual({ chatWrite: false });

		const overriding = {
			memberId: 'member-456',
			customPermissions: { canJoinMeeting: false },
			effectivePermissions: legacyPermissions()
		} as unknown as MeetRoomMemberDocument;

		expect(roomMemberV1ToV2(overriding).customPermissions).toEqual({ meetingJoin: false, meetingRead: false });
	});
});
