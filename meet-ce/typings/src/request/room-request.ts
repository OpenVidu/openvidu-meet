import { MeetRoomConfig } from '../database/room-config.js';
import { MeetRoomMemberPermissions } from '../database/room-member-permissions.js';
import { MeetRoomAutoDeletionPolicy } from '../database/room.entity.js';

/**
 * Options for creating a room.
 */
export interface MeetRoomOptions {
	/**
	 * Name of the room
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
	 * Configuration of the room. See {@link MeetRoomConfig} for details.
	 */
	config?: Partial<MeetRoomConfig>;
	/**
	 * Roles configuration for the room. See {@link MeetRoomRolesConfig} for details.
	 */
	roles?: MeetRoomRolesConfig;
	/**
	 * Anonymous access configuration for the room. See {@link MeetRoomAnonymousConfig} for details.
	 */
	anonymous?: MeetRoomAnonymousConfig;
}

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
 * Anonymous access configuration for creating/updating a room.
 * Only includes enabled flags.
 */
export interface MeetRoomAnonymousConfig {
	moderator?: {
		enabled: boolean;
	};
	speaker?: {
		enabled: boolean;
	};
}
