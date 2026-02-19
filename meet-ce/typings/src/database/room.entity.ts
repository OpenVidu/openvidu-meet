import { MeetRoomConfig } from './room-config.js';
import { MeetRoomMemberPermissions } from './room-member-permissions.js';

/**
 * Interface representing a meeting room in the system.
 */
export interface MeetRoom {
	/**
	 * Unique identifier of the room
	 */
	roomId: string;
	/**
	 * Name of the room
	 */
	roomName: string;
	/**
	 * User ID of the registered Meet user who owns this room
	 */
	owner: string;
	/**
	 * Timestamp in milliseconds since epoch when the room was created
	 */
	creationDate: number;
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
	 * General access URL for registered users with access to the room.
	 */
	accessUrl: string;
	/**
	 * Status of the room. See {@link MeetRoomStatus} for details.
	 */
	status: MeetRoomStatus;
	/**
	 * Timestamp in milliseconds since epoch of the last time the room's role permissions or anonymous access were updated
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
