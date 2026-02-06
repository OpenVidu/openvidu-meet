import { MeetRoomMemberPermissions } from './permissions/meet-permissions.js';
import { MeetRoomConfig } from './room-config.js';

/**
 * Options for creating a room.
 */
export interface MeetRoomOptions {
	/**
	 * Name of the room
	 */
	roomName?: string;
	/**
	 * Date in milliseconds since epoch when the room will be automatically deleted
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
	// maxParticipants?: number | null;
}

/**
 * Representation of a room
 */
export interface MeetRoom extends MeetRoomOptions {
	/**
	 * Unique identifier of the room
	 */
	roomId: string;
	/**
	 * Name of the room
	 */
	roomName: string;
	/**
	 * User ID of the internal Meet user who owns this room
	 */
	owner: string;
	/**
	 * Timestamp of room creation in milliseconds since epoch
	 */
	creationDate: number;
	/**
	 * Configuration of the room. See {@link MeetRoomConfig} for details.
	 */
	config: MeetRoomConfig;
	/**
	 * Roles configuration for the room. See {@link MeetRoomRoles} for details.
	 */
	roles: MeetRoomRoles;
	/**
	 * Anonymous access configuration for the room. See {@link MeetRoomAnonymous} for details.
	 */
	anonymous: MeetRoomAnonymous;
	/**
	 * General access URL for authenticated users (owner and internal members)
	 */
	accessUrl: string;
	/**
	 * Status of the room. See {@link MeetRoomStatus} for details.
	 */
	status: MeetRoomStatus;
	/**
	 * Timestamp in milliseconds of the last time the room's role permissions or anonymous access were updated
	 */
	rolesUpdatedAt: number;
	/**
	 * Action to take on the room when the meeting ends. See {@link MeetingEndAction} for details.
	 */
	meetingEndAction: MeetingEndAction;
}

/**
 * Roles configuration for a room.
 * Defines the complete permissions for moderator and speaker roles.
 */
export interface MeetRoomRoles {
	moderator: {
		permissions: MeetRoomMemberPermissions;
	};
	speaker: {
		permissions: MeetRoomMemberPermissions;
	};
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
 * Anonymous access configuration for a room.
 * Defines which roles have anonymous access enabled and their access URLs.
 */
export interface MeetRoomAnonymous {
	moderator: {
		enabled: boolean;
		accessUrl: string;
	};
	speaker: {
		enabled: boolean;
		accessUrl: string;
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

/**
 * Represents the current status of a meeting room.
 */
export enum MeetRoomStatus {
	/**
	 * Room is open and available to host a meeting.
	 */
	OPEN = 'open',

	/**
	 * There is an ongoing meeting in the room.
	 */
	ACTIVE_MEETING = 'active_meeting',

	/**
	 * Room is closed to hosting new meetings.
	 */
	CLOSED = 'closed'
}

/**
 * Defines the action to take when a meeting ends.
 */
export enum MeetingEndAction {
	/**
	 * No action is taken when the meeting ends.
	 */
	NONE = 'none',

	/**
	 * The room will be closed when the meeting ends.
	 */
	CLOSE = 'close',

	/**
	 * The room (and its recordings, if any) will be deleted
	 * when the meeting ends.
	 */
	DELETE = 'delete'
}

/**
 * Configuration for automatic deletion behavior of a meeting room.
 */
export interface MeetRoomAutoDeletionPolicy {
	/**
	 * Deletion policy when there is an active meeting.
	 */
	withMeeting: MeetRoomDeletionPolicyWithMeeting;

	/**
	 * Deletion policy when recordings exist.
	 */
	withRecordings: MeetRoomDeletionPolicyWithRecordings;
}

/**
 * Defines how room deletion behaves when a meeting is active.
 */
export enum MeetRoomDeletionPolicyWithMeeting {
	/**
	 * Force deletion even if there is an active meeting.
	 */
	FORCE = 'force',

	/**
	 * Delete the room when the meeting ends.
	 */
	WHEN_MEETING_ENDS = 'when_meeting_ends',

	/**
	 * Fail the deletion if there is an active meeting.
	 */
	FAIL = 'fail'
}

/**
 * Defines how room deletion behaves when recordings exist.
 */
export enum MeetRoomDeletionPolicyWithRecordings {
	/**
	 * Force deletion even if there are ongoing or previous recordings.
	 */
	FORCE = 'force',

	/**
	 * Close the room and keep recordings.
	 */
	CLOSE = 'close',

	/**
	 * Fail the deletion if there are ongoing or previous recordings.
	 */
	FAIL = 'fail'
}

export enum MeetRoomDeletionSuccessCode {
	ROOM_DELETED = 'room_deleted',
	ROOM_WITH_ACTIVE_MEETING_DELETED = 'room_with_active_meeting_deleted',
	ROOM_WITH_ACTIVE_MEETING_SCHEDULED_TO_BE_DELETED = 'room_with_active_meeting_scheduled_to_be_deleted',
	ROOM_AND_RECORDINGS_DELETED = 'room_and_recordings_deleted',
	ROOM_CLOSED = 'room_closed',
	ROOM_WITH_ACTIVE_MEETING_AND_RECORDINGS_DELETED = 'room_with_active_meeting_and_recordings_deleted',
	ROOM_WITH_ACTIVE_MEETING_CLOSED = 'room_with_active_meeting_closed',
	ROOM_WITH_ACTIVE_MEETING_AND_RECORDINGS_SCHEDULED_TO_BE_DELETED = 'room_with_active_meeting_and_recordings_scheduled_to_be_deleted',
	ROOM_WITH_ACTIVE_MEETING_SCHEDULED_TO_BE_CLOSED = 'room_with_active_meeting_scheduled_to_be_closed'
}

export enum MeetRoomDeletionErrorCode {
	ROOM_HAS_ACTIVE_MEETING = 'room_has_active_meeting',
	ROOM_HAS_RECORDINGS = 'room_has_recordings',
	ROOM_WITH_ACTIVE_MEETING_HAS_RECORDINGS = 'room_with_active_meeting_has_recordings',
	ROOM_WITH_ACTIVE_MEETING_HAS_RECORDINGS_CANNOT_SCHEDULE_DELETION = 'room_with_active_meeting_has_recordings_cannot_schedule_deletion',
	ROOM_WITH_RECORDINGS_HAS_ACTIVE_MEETING = 'room_with_recordings_has_active_meeting'
}
