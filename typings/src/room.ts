import { ParticipantPermissions, ParticipantRole } from './participant.js';
import { MeetRoomPreferences } from './room-preferences.js';

interface BaseRoomOptions {
    roomName?: string;
    autoDeletionDate?: number;
    autoDeletionPolicy?: MeetRoomAutoDeletionPolicy;
    preferences?: MeetRoomPreferences;
    // maxParticipants?: number | null;
}

/**
 * Options for creating or configuring a room.
 */
export type MeetRoomOptions = BaseRoomOptions;

/**
 * Interface representing the response received when a room is created.
 */
export interface MeetRoom extends BaseRoomOptions {
    roomId: string;
    roomName: string;
    creationDate: number;
    preferences: MeetRoomPreferences;
    moderatorUrl: string;
    speakerUrl: string;
    status: MeetRoomStatus;
    meetingEndAction: MeetingEndAction; // Action to take on the room when the meeting ends
}

export const enum MeetRoomStatus {
    OPEN = 'open', // Room is open and available to host a meeting
    ACTIVE_MEETING = 'active_meeting', // There is an ongoing meeting in the room
    CLOSED = 'closed' // Room is closed to hosting new meetings
}

export const enum MeetingEndAction {
    NONE = 'none', // No action is taken when the meeting ends
    CLOSE = 'close', // The room will be closed when the meeting ends
    DELETE = 'delete' // The room (and its recordings if any) will be deleted when the meeting ends
}

export interface MeetRoomAutoDeletionPolicy {
    withMeeting: MeetRoomDeletionPolicyWithMeeting;
    withRecordings: MeetRoomDeletionPolicyWithRecordings;
}

export const enum MeetRoomDeletionPolicyWithMeeting {
    FORCE = 'force', // Force deletion even if there is an active meeting
    WHEN_MEETING_ENDS = 'when_meeting_ends', // Delete the room when the meeting ends
    FAIL = 'fail' // Fail the deletion if there is an active meeting
}

export const enum MeetRoomDeletionPolicyWithRecordings {
    FORCE = 'force', // Force deletion even if there are ongoing or previous recordings
    CLOSE = 'close', // Close the room and keep recordings
    FAIL = 'fail' // Fail the deletion if there are ongoing or previous recordings
}

export interface MeetRoomRoleAndPermissions {
    role: ParticipantRole;
    permissions: ParticipantPermissions;
}

export type MeetRoomFilters = {
    maxItems?: number;
    nextPageToken?: string;
    roomName?: string;
    fields?: string;
};
