import { LiveKitPermissions } from './permissions/livekit-permissions.js';
import { MeetPermissions } from './permissions/meet-permissions.js';

/**
 * Options for generating a room member token.
 * A room member token provides access to room resources (recordings, meetings, etc.)
 */
export interface MeetRoomMemberTokenOptions {
    /**
     * A secret key for room access. Determines the member's role.
     */
    secret: string;
    /**
     * Whether to include meeting join permissions in the token.
     * If true, participantName must be provided.
     */
    grantJoinMeetingPermission?: boolean;
    /**
     * The name of the participant when joining the meeting.
     * Required if grantJoinMeetingPermission is true and this is a new token (not a refresh).
     */
    participantName?: string;
    /**
     * The identity of the participant in the meeting.
     * Required when refreshing an existing token with meeting permissions.
     */
    participantIdentity?: string;
}

/**
 * Represents the permissions for an individual participant.
 */
export interface MeetRoomMemberPermissions {
    livekit: LiveKitPermissions;
    meet: MeetPermissions;
}

/**
 * Represents the role of a participant in a room.
 */
export enum MeetRoomMemberRole {
    MODERATOR = 'moderator',
    SPEAKER = 'speaker'
}

/**
 * Metadata stored in room member tokens.
 * Contains information about roles and permissions for accessing room resources.
 */
export interface MeetRoomMemberTokenMetadata {
    livekitUrl: string;
    role: MeetRoomMemberRole;
    permissions: MeetPermissions;
}
