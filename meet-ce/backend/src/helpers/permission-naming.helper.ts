import type {
	MeetDeprecatedPermissionKey,
	MeetPermissionKey,
	MeetRoom,
	MeetRoomMember,
	MeetRoomRoles
} from '@openvidu-meet/typings';
import { toDeprecatedPermissions } from '@openvidu-meet/typings';

/**
 * A permission object as it travels on the wire: the current keys plus the deprecated `can*`
 * spellings derived from them. Removed in 3.12.0 together with the deprecated spellings.
 */
export type MeetPermissionsWire = Partial<Record<MeetPermissionKey | MeetDeprecatedPermissionKey, boolean>>;

/**
 * Adds the deprecated `can*` spellings next to the current keys of a permission object. Storage and
 * tokens hold only the current keys, so this runs at the JSON boundary of REST responses and webhook
 * payloads alike. The split recording group collapses with AND and its deprecated flag is omitted
 * when the group is incomplete (see `toDeprecatedPermissions`), so an object served here is always
 * accepted back unchanged by the permission schemas.
 */
export const withDeprecatedPermissionAliases = (
	permissions: Readonly<Partial<Record<MeetPermissionKey, boolean>>>
): MeetPermissionsWire => ({ ...permissions, ...toDeprecatedPermissions(permissions) });

export const rolesToWire = (roles: MeetRoomRoles): MeetRoomRoles =>
	// The wire shape is wider than the MeetRoomRoles type; the cast is confined to this JSON boundary.
	({
		moderator: { permissions: withDeprecatedPermissionAliases(roles.moderator.permissions) },
		speaker: { permissions: withDeprecatedPermissionAliases(roles.speaker.permissions) }
	}) as unknown as MeetRoomRoles;

/**
 * Rooms without roles (field-filtered responses) pass through untouched.
 */
export const roomToWire = <T extends Partial<MeetRoom>>(room: T): T => {
	if (!room.roles) {
		return room;
	}

	return { ...room, roles: rolesToWire(room.roles) };
};

/**
 * Members without permission fields (field-filtered responses) pass through untouched.
 */
export const memberToWire = <T extends Partial<MeetRoomMember>>(member: T): T => {
	const wire = { ...member } as Record<string, unknown>;

	if (member.customPermissions) {
		wire.customPermissions = withDeprecatedPermissionAliases(member.customPermissions);
	}

	if (member.effectivePermissions) {
		wire.effectivePermissions = withDeprecatedPermissionAliases(member.effectivePermissions);
	}

	return wire as T;
};
