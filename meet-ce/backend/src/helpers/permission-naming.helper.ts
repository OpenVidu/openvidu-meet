import type { MeetRoom, MeetRoomMember, MeetRoomRoles } from '@openvidu-meet/typings';
import { toLegacyPermissions } from '@openvidu-meet/typings';
import type { Response } from 'express';

/**
 * Which key set a response serializes room-member permissions with. Requests choose through the
 * `X-Meet-Permission-Names` header; `legacy` is the default during the 3.8/3.9 deprecation window
 * so existing clients never see the canonical names until they ask for them. The header, this type
 * and the whole legacy branch are removed in 3.12.0.
 */
export type PermissionNaming = 'legacy' | 'canonical';

/** Request header selecting the permission naming of the response (see {@link PermissionNaming}). */
export const PERMISSION_NAMING_HEADER = 'X-Meet-Permission-Names';

/**
 * Serializes permission objects to the key set the request selected. Exactly one naming per response
 * (never both): returning the two key sets at once breaks the GET → mutate → PUT round-trip, because
 * the PUT would carry a conflicting mixed payload (see D3 in the migration plan).
 *
 * Storage and tokens are canonical, so `canonical` is the identity and `legacy` maps through
 * `toLegacyPermissions()` — the split recording group collapses with AND and is omitted when
 * incomplete, so a legacy client hides a half-granted feature instead of offering a button that
 * would be rejected.
 *
 * Every `*ToWire` method reads the naming parsed by `parsePermissionNamingHeader` from `res.locals`
 * and, when it actually rewrites permissions to the legacy names, stamps `Deprecation: true` on the
 * response as the machine-readable signal (its `Sunset` companion, RFC 8594, needs the 3.12.0
 * release date, which is not scheduled yet — it ships with the OpenAPI phase once that date exists).
 */
export class PermissionNamingHelper {
	/**
	 * Resolves the naming selected by the request. Defaults to `legacy` while the deprecation window
	 * is open.
	 */
	static getNaming(res: Response): PermissionNaming {
		return (res.locals.permissionNaming as PermissionNaming | undefined) ?? 'legacy';
	}

	/**
	 * Returns a copy of the room with `roles.*.permissions` in the requested naming.
	 * Rooms without roles (field-filtered responses) pass through untouched.
	 */
	static roomToWire<T extends Partial<MeetRoom>>(room: T, res: Response): T {
		if (PermissionNamingHelper.getNaming(res) === 'canonical' || !room.roles) {
			return room;
		}

		return { ...room, roles: PermissionNamingHelper.rolesToWire(room.roles, res) };
	}

	/**
	 * Returns a copy of the roles config with each role's permissions in the requested naming.
	 */
	static rolesToWire(roles: MeetRoomRoles, res: Response): MeetRoomRoles {
		if (PermissionNamingHelper.getNaming(res) === 'canonical') {
			return roles;
		}

		PermissionNamingHelper.markDeprecatedNaming(res);

		// The legacy wire shape no longer matches the canonical MeetRoomRoles type; the cast is
		// confined to this JSON boundary.
		return {
			moderator: { permissions: toLegacyPermissions(roles.moderator.permissions) },
			speaker: { permissions: toLegacyPermissions(roles.speaker.permissions) }
		} as unknown as MeetRoomRoles;
	}

	/**
	 * Returns a copy of the member with `customPermissions`/`effectivePermissions` in the requested
	 * naming. Members without permission fields (field-filtered responses) pass through untouched.
	 */
	static memberToWire<T extends Partial<MeetRoomMember>>(member: T, res: Response): T {
		if (
			PermissionNamingHelper.getNaming(res) === 'canonical' ||
			(!member.customPermissions && !member.effectivePermissions)
		) {
			return member;
		}

		PermissionNamingHelper.markDeprecatedNaming(res);

		const wire = { ...member } as Record<string, unknown>;

		if (member.customPermissions) {
			wire.customPermissions = toLegacyPermissions(member.customPermissions);
		}

		if (member.effectivePermissions) {
			wire.effectivePermissions = toLegacyPermissions(member.effectivePermissions);
		}

		return wire as T;
	}

	private static markDeprecatedNaming(res: Response): void {
		if (!res.headersSent) {
			res.set('Deprecation', 'true');
		}
	}
}
