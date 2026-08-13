import { describe, expect, it } from '@jest/globals';
import type { MeetPermissionKey, MeetRoomMemberPermissions } from '@openvidu-meet/typings';
import {
	findPermissionAliasConflicts,
	MEET_DEPRECATED_PERMISSION_KEYS,
	MEET_PERMISSION_ALIASES,
	MEET_PERMISSION_DEPRECATED_ALIASES,
	MEET_PERMISSION_KEYS,
	MEET_ROOM_MEMBER_PERMISSIONS_FIELDS,
	MEET_UNALIASED_PERMISSION_KEYS,
	normalizePermissions,
	toDeprecatedPermissions
} from '@openvidu-meet/typings';
import { AssertReadonlyArrayCoversUnion } from '../type-assertions.utils.js';

describe('Permission alias map', () => {
	it('should cover every MeetRoomMemberPermissions property', () => {
		// Runtime check on top of the compile-time one: MEET_ROOM_MEMBER_PERMISSIONS_FIELDS is the
		// runtime mirror of the interface, so a key added there without an alias-map entry fails
		// here. The deprecated set stays frozen at 14 until it is removed in 3.12.0.
		expect([...MEET_PERMISSION_KEYS].sort()).toEqual([...MEET_ROOM_MEMBER_PERMISSIONS_FIELDS].sort());
		expect(MEET_DEPRECATED_PERMISSION_KEYS).toHaveLength(14);

		const assertPermissionKeysCoverage: AssertReadonlyArrayCoversUnion<
			keyof MeetRoomMemberPermissions,
			typeof MEET_PERMISSION_KEYS
		> = true;
		expect(assertPermissionKeysCoverage).toBe(true);
	});

	it('should never reuse a permission name across modules', () => {
		expect(new Set(MEET_PERMISSION_KEYS).size).toBe(MEET_PERMISSION_KEYS.length);
		// Every key except the ones born after the rename maps back to a deprecated spelling.
		expect(Object.keys(MEET_PERMISSION_DEPRECATED_ALIASES)).toHaveLength(
			MEET_PERMISSION_KEYS.length - MEET_UNALIASED_PERMISSION_KEYS.length
		);
	});

	it('should split recording retrieval into list, play and download', () => {
		expect(MEET_PERMISSION_ALIASES.canRetrieveRecordings).toEqual([
			'recordingList',
			'recordingPlay',
			'recordingDownload'
		]);
		expect(MEET_PERMISSION_ALIASES.canRecord).toEqual(['recordingControl']);
		expect(MEET_PERMISSION_ALIASES.canDeleteRecordings).toEqual(['recordingDelete']);
		// 14 deprecated flags become 16 current ones: only recording retrieval is split.
		expect(MEET_PERMISSION_KEYS).toHaveLength(16 + MEET_UNALIASED_PERMISSION_KEYS.length);
	});

	it('should keep the permissions born after the rename out of the deprecated surface', () => {
		// They are contract keys like any other, they simply have no `can*` spelling: a deployment
		// must never invent one, so they appear in neither direction of the alias map.
		expect(MEET_UNALIASED_PERMISSION_KEYS).toEqual(['meetingRead']);

		for (const permissionKey of MEET_UNALIASED_PERMISSION_KEYS) {
			expect(MEET_PERMISSION_KEYS).toContain(permissionKey);
			expect(MEET_PERMISSION_DEPRECATED_ALIASES[permissionKey]).toBeUndefined();
			expect(Object.values(MEET_PERMISSION_ALIASES).flat()).not.toContain(permissionKey);
		}

		// ...and therefore never travel back to a client that speaks the deprecated names.
		const deprecated = toDeprecatedPermissions(
			Object.fromEntries(MEET_PERMISSION_KEYS.map((key) => [key, true])) as Record<MeetPermissionKey, boolean>
		);

		for (const permissionKey of MEET_UNALIASED_PERMISSION_KEYS) {
			expect(deprecated).not.toHaveProperty(permissionKey);
		}
	});

	it('should map every current key back to the deprecated key it replaces', () => {
		for (const deprecatedKey of MEET_DEPRECATED_PERMISSION_KEYS) {
			for (const replacementKey of MEET_PERMISSION_ALIASES[deprecatedKey]) {
				expect(MEET_PERMISSION_DEPRECATED_ALIASES[replacementKey]).toBe(deprecatedKey);
			}
		}
	});

	it('should never map a deprecated key onto another deprecated key', () => {
		const deprecatedKeys = new Set<string>(MEET_DEPRECATED_PERMISSION_KEYS);

		for (const permissionKey of MEET_PERMISSION_KEYS) {
			expect(deprecatedKeys.has(permissionKey)).toBe(false);
		}
	});

	it('should follow the naming rules: no `can` prefix, no `Manage` verb, module first', () => {
		const modules = [
			'recording',
			'meeting',
			'room',
			'participant',
			'media',
			'chat',
			'file',
			'reaction',
			'hand',
			'breakout',
			'notes',
			'whiteboard',
			'lobby',
			'broadcast'
		];

		for (const permissionKey of MEET_PERMISSION_KEYS) {
			expect(permissionKey.startsWith('can')).toBe(false);
			expect(permissionKey).not.toContain('Manage');
			expect(modules.some((module) => permissionKey.startsWith(module))).toBe(true);
		}
	});
});

describe('normalizePermissions', () => {
	it('should rewrite deprecated keys to the current ones', () => {
		expect(normalizePermissions({ canRecord: true, canWriteChat: false })).toEqual({
			recordingControl: true,
			chatWrite: false
		});
	});

	it('should expand a split alias to its whole group', () => {
		expect(normalizePermissions({ canRetrieveRecordings: true })).toEqual({
			recordingList: true,
			recordingPlay: true,
			recordingDownload: true
		});
		expect(normalizePermissions({ canRetrieveRecordings: false })).toEqual({
			recordingList: false,
			recordingPlay: false,
			recordingDownload: false
		});
	});

	it('should let a current key override the group it belongs to', () => {
		// Resolution rule only: an input like this is a conflict and the API rejects it with a 422
		// (see findPermissionAliasConflicts). Normalizing it is what happens once the caller has been
		// told to pick one spelling — the finer-grained flag wins.
		expect(normalizePermissions({ canRetrieveRecordings: true, recordingDownload: false })).toEqual({
			recordingList: true,
			recordingPlay: true,
			recordingDownload: false
		});
	});

	it('should pass current keys through untouched', () => {
		expect(normalizePermissions({ recordingControl: true, mediaChangeVirtualBackground: false })).toEqual({
			recordingControl: true,
			mediaChangeVirtualBackground: false
		});
	});

	it('should merge a mixed input and let the current key win', () => {
		expect(normalizePermissions({ canRecord: false, recordingControl: true, canReadChat: true })).toEqual({
			recordingControl: true,
			chatRead: true
		});
	});

	it('should drop unknown keys and non-boolean values', () => {
		expect(normalizePermissions({ canRecord: 'yes', somethingElse: true, chatRead: true })).toEqual({
			chatRead: true
		});
	});

	it('should produce a complete permission set from a complete deprecated set', () => {
		const deprecatedInput = Object.fromEntries(MEET_DEPRECATED_PERMISSION_KEYS.map((key) => [key, true]));
		const normalized = normalizePermissions(deprecatedInput);
		expect(Object.keys(normalized).sort()).toEqual([...MEET_PERMISSION_KEYS].sort());
	});

	// A permission that did not exist when an input was produced must not read as denied: it inherits
	// the permission that governed the same capability before it was split out, so behaviour is
	// identical until someone sets the new key explicitly.
	it('should inherit meetingRead from meetingJoin when it is absent', () => {
		expect(normalizePermissions({ meetingJoin: true })).toEqual({ meetingJoin: true, meetingRead: true });
		expect(normalizePermissions({ meetingJoin: false })).toEqual({ meetingJoin: false, meetingRead: false });
		// The deprecated spelling cannot name it either, and reaches it through meetingJoin.
		expect(normalizePermissions({ canJoinMeeting: true })).toEqual({ meetingJoin: true, meetingRead: true });
	});

	it('should keep an explicit meetingRead that diverges from meetingJoin', () => {
		expect(normalizePermissions({ meetingJoin: true, meetingRead: false })).toEqual({
			meetingJoin: true,
			meetingRead: false
		});
		expect(normalizePermissions({ meetingRead: true })).toEqual({ meetingRead: true });
	});

	it('should not inherit into an overlay that says nothing about meetingJoin', () => {
		expect(normalizePermissions({ chatRead: true })).toEqual({ chatRead: true });
	});
});

describe('toDeprecatedPermissions', () => {
	it('should rewrite current keys back to the deprecated ones', () => {
		expect(toDeprecatedPermissions({ recordingControl: true, chatWrite: false })).toEqual({
			canRecord: true,
			canWriteChat: false
		});
	});

	it('should collapse a split group with AND', () => {
		expect(toDeprecatedPermissions({ recordingList: true, recordingPlay: true, recordingDownload: true })).toEqual({
			canRetrieveRecordings: true
		});
		// "play but no download" cannot be expressed by the old flag: the safe reading is false, so an
		// old client hides the feature instead of offering a button that would be rejected.
		expect(toDeprecatedPermissions({ recordingList: true, recordingPlay: true, recordingDownload: false })).toEqual(
			{
				canRetrieveRecordings: false
			}
		);
	});

	it('should omit a split group when part of it is missing', () => {
		expect(toDeprecatedPermissions({ recordingList: true, recordingPlay: true })).toEqual({});
	});

	it('should round-trip a complete set', () => {
		const current = Object.fromEntries(MEET_PERMISSION_KEYS.map((key) => [key, true])) as Record<
			MeetPermissionKey,
			boolean
		>;
		expect(normalizePermissions(toDeprecatedPermissions(current))).toEqual(current);
	});

	it('should omit keys with no boolean value', () => {
		expect(toDeprecatedPermissions({ recordingControl: undefined, chatRead: true })).toEqual({
			canReadChat: true
		});
	});
});

describe('findPermissionAliasConflicts', () => {
	it('should report nothing when only one spelling is used', () => {
		expect(findPermissionAliasConflicts({ canRecord: true, chatRead: false })).toEqual([]);
	});

	it('should report nothing when both spellings agree', () => {
		expect(findPermissionAliasConflicts({ canRecord: true, recordingControl: true })).toEqual([]);
	});

	it('should report the contradicting pair', () => {
		expect(findPermissionAliasConflicts({ canRecord: false, recordingControl: true })).toEqual([
			{
				deprecatedKey: 'canRecord',
				replacementKey: 'recordingControl',
				deprecatedValue: false,
				replacementValue: true
			}
		]);
	});

	it('should check a split alias against every key of its group', () => {
		const conflicts = findPermissionAliasConflicts({
			canRetrieveRecordings: true,
			recordingList: true,
			recordingDownload: false
		});
		expect(conflicts).toEqual([
			{
				deprecatedKey: 'canRetrieveRecordings',
				replacementKey: 'recordingDownload',
				deprecatedValue: true,
				replacementValue: false
			}
		]);
	});

	it('should report every contradicting pair', () => {
		const conflicts = findPermissionAliasConflicts({
			canRecord: false,
			recordingControl: true,
			canReadChat: true,
			chatRead: false
		});
		expect(conflicts).toHaveLength(2);
		expect(conflicts.map((conflict) => conflict.replacementKey).sort()).toEqual(['chatRead', 'recordingControl']);
	});
});
