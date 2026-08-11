import type {
	MeetDeprecatedPermissionKey,
	MeetPermissionKey,
	MeetRoom,
	MeetRoomMember,
	MeetRoomRoles
} from '@openvidu-meet/typings';
import { toDeprecatedPermissions } from '@openvidu-meet/typings';
import type { Response } from 'express';
import { isCompatibilityMode } from '../environment.js';

/**
 * A permission object as it travels on the wire in compatibility mode: the current keys plus the
 * deprecated `can*` spellings derived from them. With `MEET_MODE='3.9.0'` the wire shape is just the
 * current keys and this type is not produced.
 */
export type MeetPermissionsWire = Partial<Record<MeetPermissionKey | MeetDeprecatedPermissionKey, boolean>>;

/**
 * Adds the deprecated `can*` spellings next to the current keys of a permission object. Pure — used
 * by both the REST serialization below and the webhook payloads, which have no `Response` to stamp.
 *
 * The split recording group collapses with AND and its deprecated flag is omitted when the group is
 * incomplete (see `toDeprecatedPermissions`); every other alias mirrors its replacement's value, so
 * echoing a compatibility-mode response back at the API never trips the conflict check.
 */
export function withDeprecatedPermissionAliases(
	permissions: Readonly<Partial<Record<MeetPermissionKey, boolean>>>
): MeetPermissionsWire {
	return { ...permissions, ...toDeprecatedPermissions(permissions) };
}

/**
 * Serializes permission objects to the key set the deployment's `MEET_MODE` selects:
 *
 * - `compatibility` (default): responses carry **both** key sets — the current keys plus the
 *   deprecated `can*` spellings — so a not-yet-migrated client keeps reading the names it knows
 *   while a migrated one already reads the new ones, endpoint by endpoint.
 * - `'3.9.0'`: responses carry only the current keys; the deprecated surface is off.
 *
 * Storage and tokens always hold the current keys, so the `3.9.0` branch is the identity and the
 * compatibility branch adds the deprecated spellings through `toDeprecatedPermissions()` — the split
 * recording group collapses with AND and is omitted when incomplete, so an old client hides a
 * half-granted feature instead of offering a button that would be rejected.
 *
 * Every `*ToWire` method stamps `Deprecation: true` when it actually added deprecated spellings, as
 * the machine-readable signal that the response leans on a surface that goes away. We don't send a
 * `Sunset` header (RFC 8594): it requires a real calendar date, and 3.12.0 is a release number, not
 * a date. The removal release is documented in the contract instead — the `@deprecated` tags and the
 * OpenAPI descriptions all say "Removed in 3.12.0".
 */
export class PermissionNamingHelper {
	/**
	 * Returns a copy of the room with `roles.*.permissions` in the wire shape of the current mode.
	 * Rooms without roles (field-filtered responses) pass through untouched.
	 */
	static roomToWire<T extends Partial<MeetRoom>>(room: T, res: Response): T {
		if (!isCompatibilityMode() || !room.roles) {
			return room;
		}

		return { ...room, roles: PermissionNamingHelper.rolesToWire(room.roles, res) };
	}

	/**
	 * Returns a copy of the roles config with each role's permissions in the wire shape of the
	 * current mode.
	 */
	static rolesToWire(roles: MeetRoomRoles, res: Response): MeetRoomRoles {
		if (!isCompatibilityMode()) {
			return roles;
		}

		PermissionNamingHelper.markDeprecatedNaming(res);

		// The compatibility wire shape is wider than the MeetRoomRoles type; the cast is confined to
		// this JSON boundary.
		return {
			moderator: { permissions: withDeprecatedPermissionAliases(roles.moderator.permissions) },
			speaker: { permissions: withDeprecatedPermissionAliases(roles.speaker.permissions) }
		} as unknown as MeetRoomRoles;
	}

	/**
	 * Returns a copy of the member with `customPermissions`/`effectivePermissions` in the wire shape
	 * of the current mode. Members without permission fields (field-filtered responses) pass through
	 * untouched.
	 */
	static memberToWire<T extends Partial<MeetRoomMember>>(member: T, res: Response): T {
		if (!isCompatibilityMode() || (!member.customPermissions && !member.effectivePermissions)) {
			return member;
		}

		PermissionNamingHelper.markDeprecatedNaming(res);

		const wire = { ...member } as Record<string, unknown>;

		if (member.customPermissions) {
			wire.customPermissions = withDeprecatedPermissionAliases(member.customPermissions);
		}

		if (member.effectivePermissions) {
			wire.effectivePermissions = withDeprecatedPermissionAliases(member.effectivePermissions);
		}

		return wire as T;
	}

	private static markDeprecatedNaming(res: Response): void {
		if (!res.headersSent) {
			res.set('Deprecation', 'true');
		}
	}
}
