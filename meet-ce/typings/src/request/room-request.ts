import { MeetBroadcastConfig, MeetRoomConfig } from '../database/room-config.js';
import { MeetRoomMemberPermissions } from '../database/room-member-permissions.js';
import { MeetRoomAutoDeletionPolicy } from '../database/room.entity.js';

/**
 * Options for creating a room.
 */
export interface MeetRoomOptions {
	/**
	 * Display name of the room. It does not need to be unique. Maximum 50 characters, with surrounding
	 * whitespace removed and repeated whitespace collapsed.
	 * Optional: omitting it creates the room with the default name `Room`.
	 */
	roomName?: string;
	/**
	 * Timestamp in milliseconds since epoch when the room will be automatically deleted
	 */
	autoDeletionDate?: number;
	/**
	 * Configuration for automatic deletion behavior of the room. See {@link MeetRoomAutoDeletionPolicy} for details.
	 */
	autoDeletionPolicy?: MeetRoomAutoDeletionPolicy;
	/**
	 * Configuration of the room. See {@link MeetRoomConfigOptions} for details.
	 */
	config?: MeetRoomConfigOptions;
	/**
	 * Roles configuration for the room. See {@link MeetRoomRolesConfig} for details.
	 */
	roles?: MeetRoomRolesConfig;
	/**
	 * Access configuration for the room. See {@link MeetRoomAccessConfig} for details.
	 */
	access?: MeetRoomAccessConfig;
}

/**
 * Configuration of a room as a request sends it, to create the room or to update its config: every
 * field is optional. Omitted, a field takes its default on creation and keeps its current value on
 * an update. See {@link MeetRoomConfig} for details.
 */
export type MeetRoomConfigOptions = Partial<Omit<MeetRoomConfig, 'broadcast'>> & {
	/** Live broadcast configuration. See {@link MeetBroadcastConfigOptions} for details. */
	broadcast?: MeetBroadcastConfigOptions;
};

/**
 * Live broadcast configuration as a request sends it. The destination list is optional: omitted, a
 * new room has no destinations and an update keeps the saved ones; sent, it replaces the whole list.
 * Enabling live broadcast needs at least one destination, sent or saved. See
 * {@link MeetBroadcastConfig} for details.
 */
export type MeetBroadcastConfigOptions = Omit<MeetBroadcastConfig, 'destinations'> &
	Partial<Pick<MeetBroadcastConfig, 'destinations'>>;

/**
 * Roles configuration for creating/updating a room.
 * Allows partial permission updates.
 */
export interface MeetRoomRolesConfig {
	moderator?: {
		permissions: Partial<MeetRoomMemberPermissions>;
	};
	speaker?: {
		permissions: Partial<MeetRoomMemberPermissions>;
	};
}

/**
 * Access configuration for creating/updating a room.
 * Only includes enabled flags.
 */
export interface MeetRoomAccessConfig {
	anonymous?: {
		moderator?: {
			enabled: boolean;
		};
		speaker?: {
			enabled: boolean;
		};
		recording?: {
			enabled: boolean;
		};
	};
	user?: {
		enabled: boolean;
	};
}
