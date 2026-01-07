import { MeetRoomMemberPermissions } from './permissions/meet-permissions.js';
import { MeetRoomConfig } from './room-config.js';
import { SortAndPagination } from './sort-pagination.js';

/**
 * Options for creating a room.
 */
export interface MeetRoomOptions {
    roomName?: string;
    autoDeletionDate?: number;
    autoDeletionPolicy?: MeetRoomAutoDeletionPolicy;
    config?: Partial<MeetRoomConfig>;
    roles?: MeetRoomRolesConfig;
    anonymous?: MeetRoomAnonymousConfig;
    // maxParticipants?: number | null;
}

/**
 * Representation of a room
 */
export interface MeetRoom extends MeetRoomOptions {
    roomId: string;
    roomName: string;
    owner: string; // userId of the internal Meet user who owns this room
    creationDate: number;
    config: MeetRoomConfig;
    roles: MeetRoomRoles; // Complete permissions for each role
    anonymous: MeetRoomAnonymous; // Anonymous access configuration
    accessUrl: string; // General access URL for authenticated users (owner and internal members)
    status: MeetRoomStatus;
    meetingEndAction: MeetingEndAction; // Action to take on the room when the meeting ends
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

export enum MeetRoomStatus {
    OPEN = 'open', // Room is open and available to host a meeting
    ACTIVE_MEETING = 'active_meeting', // There is an ongoing meeting in the room
    CLOSED = 'closed' // Room is closed to hosting new meetings
}

export enum MeetingEndAction {
    NONE = 'none', // No action is taken when the meeting ends
    CLOSE = 'close', // The room will be closed when the meeting ends
    DELETE = 'delete' // The room (and its recordings if any) will be deleted when the meeting ends
}

export interface MeetRoomAutoDeletionPolicy {
    withMeeting: MeetRoomDeletionPolicyWithMeeting;
    withRecordings: MeetRoomDeletionPolicyWithRecordings;
}

export enum MeetRoomDeletionPolicyWithMeeting {
    FORCE = 'force', // Force deletion even if there is an active meeting
    WHEN_MEETING_ENDS = 'when_meeting_ends', // Delete the room when the meeting ends
    FAIL = 'fail' // Fail the deletion if there is an active meeting
}

export enum MeetRoomDeletionPolicyWithRecordings {
    FORCE = 'force', // Force deletion even if there are ongoing or previous recordings
    CLOSE = 'close', // Close the room and keep recordings
    FAIL = 'fail' // Fail the deletion if there are ongoing or previous recordings
}

export interface MeetRoomFilters extends SortAndPagination {
    roomName?: string;
    status?: MeetRoomStatus;
    fields?: string;
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
