import { describe, expect, it } from '@jest/globals';
import type { MeetPermissionKey, MeetRoomMemberPermissions } from '@openvidu-meet/typings';
import {
	findPermissionAliasConflicts,
	MEET_CANONICAL_PERMISSION_KEYS,
	MEET_LEGACY_PERMISSION_KEYS,
	MEET_PERMISSION_ALIASES,
	MEET_PERMISSION_KEYS,
	MEET_ROOM_MEMBER_PERMISSIONS_FIELDS,
	normalizePermissions,
	toLegacyPermissions
} from '@openvidu-meet/typings';
import { AssertReadonlyArrayCoversUnion } from '../type-assertions.utils.js';

describe('Permission alias map', () => {
	it('should cover every MeetRoomMemberPermissions property', () => {
		// Runtime check: nothing type-checks tests/**, so the compile-time assertion below cannot be
		// the only guard. MEET_ROOM_MEMBER_PERMISSIONS_FIELDS is the runtime mirror of the interface,
		// so a permission added there without an alias fails here.
		expect([...MEET_LEGACY_PERMISSION_KEYS].sort()).toEqual([...MEET_ROOM_MEMBER_PERMISSIONS_FIELDS].sort());
		expect(MEET_LEGACY_PERMISSION_KEYS).toHaveLength(14);

		const assertLegacyKeysCoverage: AssertReadonlyArrayCoversUnion<
			keyof MeetRoomMemberPermissions,
			typeof MEET_LEGACY_PERMISSION_KEYS
		> = true;
		expect(assertLegacyKeysCoverage).toBe(true);
	});

	it('should never reuse a canonical name across modules', () => {
		expect(new Set(MEET_PERMISSION_KEYS).size).toBe(MEET_PERMISSION_KEYS.length);
		expect(Object.keys(MEET_CANONICAL_PERMISSION_KEYS)).toHaveLength(MEET_PERMISSION_KEYS.length);
	});

	it('should split recording retrieval into list, play and download', () => {
		expect(MEET_PERMISSION_ALIASES.canRetrieveRecordings).toEqual([
			'recordingList',
			'recordingPlay',
			'recordingDownload'
		]);
		expect(MEET_PERMISSION_ALIASES.canRecord).toEqual(['recordingControl']);
		expect(MEET_PERMISSION_ALIASES.canDeleteRecordings).toEqual(['recordingDelete']);
		// 14 legacy flags become 16 canonical ones: only recording retrieval is split.
		expect(MEET_PERMISSION_KEYS).toHaveLength(16);
	});

	it('should map every canonical key back to the legacy key it came from', () => {
		for (const legacyKey of MEET_LEGACY_PERMISSION_KEYS) {
			for (const canonicalKey of MEET_PERMISSION_ALIASES[legacyKey]) {
				expect(MEET_CANONICAL_PERMISSION_KEYS[canonicalKey]).toBe(legacyKey);
			}
		}
	});

	it('should never map a legacy key onto another legacy key', () => {
		const legacyKeys = new Set<string>(MEET_LEGACY_PERMISSION_KEYS);

		for (const canonicalKey of MEET_PERMISSION_KEYS) {
			expect(legacyKeys.has(canonicalKey)).toBe(false);
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

		for (const canonicalKey of MEET_PERMISSION_KEYS) {
			expect(canonicalKey.startsWith('can')).toBe(false);
			expect(canonicalKey).not.toContain('Manage');
			expect(modules.some((module) => canonicalKey.startsWith(module))).toBe(true);
		}
	});
});

describe('normalizePermissions', () => {
	it('should rewrite legacy keys to canonical ones', () => {
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

	it('should let a canonical key override the group it belongs to', () => {
		// Resolution rule only: an input like this is a conflict and the API rejects it with a 422
		// (see findPermissionAliasConflicts). Normalizing it is what happens once the caller has been
		// told to pick one spelling — the finer-grained flag wins.
		expect(normalizePermissions({ canRetrieveRecordings: true, recordingDownload: false })).toEqual({
			recordingList: true,
			recordingPlay: true,
			recordingDownload: false
		});
	});

	it('should pass canonical keys through untouched', () => {
		expect(normalizePermissions({ recordingControl: true, mediaChangeVirtualBackground: false })).toEqual({
			recordingControl: true,
			mediaChangeVirtualBackground: false
		});
	});

	it('should merge a mixed input and let the canonical key win', () => {
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

	it('should produce a complete permission set from a complete legacy set', () => {
		const legacyInput = Object.fromEntries(MEET_LEGACY_PERMISSION_KEYS.map((key) => [key, true]));
		const normalized = normalizePermissions(legacyInput);
		expect(Object.keys(normalized).sort()).toEqual([...MEET_PERMISSION_KEYS].sort());
	});
});

describe('toLegacyPermissions', () => {
	it('should rewrite canonical keys back to legacy ones', () => {
		expect(toLegacyPermissions({ recordingControl: true, chatWrite: false })).toEqual({
			canRecord: true,
			canWriteChat: false
		});
	});

	it('should collapse a split group with AND', () => {
		expect(
			toLegacyPermissions({ recordingList: true, recordingPlay: true, recordingDownload: true })
		).toEqual({ canRetrieveRecordings: true });
		// "play but no download" cannot be expressed by the old flag: the safe reading is false, so an
		// old client hides the feature instead of offering a button that would be rejected.
		expect(
			toLegacyPermissions({ recordingList: true, recordingPlay: true, recordingDownload: false })
		).toEqual({ canRetrieveRecordings: false });
	});

	it('should omit a split group when part of it is missing', () => {
		expect(toLegacyPermissions({ recordingList: true, recordingPlay: true })).toEqual({});
	});

	it('should round-trip a complete set', () => {
		const canonical = Object.fromEntries(MEET_PERMISSION_KEYS.map((key) => [key, true])) as Record<
			MeetPermissionKey,
			boolean
		>;
		expect(normalizePermissions(toLegacyPermissions(canonical))).toEqual(canonical);
	});

	it('should omit keys with no boolean value', () => {
		expect(toLegacyPermissions({ recordingAdmin: undefined, chatRead: true })).toEqual({ canReadChat: true });
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
				legacyKey: 'canRecord',
				canonicalKey: 'recordingControl',
				legacyValue: false,
				canonicalValue: true
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
				legacyKey: 'canRetrieveRecordings',
				canonicalKey: 'recordingDownload',
				legacyValue: true,
				canonicalValue: false
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
		expect(conflicts.map((conflict) => conflict.canonicalKey).sort()).toEqual(['chatRead', 'recordingControl']);
	});
});
