import { MeetRoomConfig } from './database/room-config.js';
import { MeetRoomMemberUIBadge } from './response/room-member-response.js';

/**
 * Interface representing a signal emitted by OpenVidu Meet to notify clients about real-time updates in the meeting.
 */
export enum MeetSignalType {
	/** Emitted when the configuration of a meeting room is updated */
	MEET_ROOM_CONFIG_UPDATED = 'meet_room_config_updated',
	/** Emitted when a participant's role in a meeting room is updated */
	MEET_PARTICIPANT_ROLE_UPDATED = 'meet_participant_role_updated',
	/** Emitted when a participant must regenerate their room member token to sync updated permissions */
	MEET_PARTICIPANT_PERMISSIONS_UPDATED = 'meet_participant_permissions_updated'
}

/**
 * Payload for MEET_ROOM_CONFIG_UPDATED signal,
 * containing the updated room configuration and related information.
 */
export interface MeetRoomConfigUpdatedPayload {
	/** ID of the room whose configuration has been updated */
	roomId: string;
	/** Updated configuration of the meeting room */
	config: MeetRoomConfig;
	/** Timestamp in milliseconds when the update occurred */
	timestamp: number;
}

/**
 * Payload for MEET_PARTICIPANT_ROLE_UPDATED signal,
 * containing information about the participant whose role was updated and the new badge.
 */
export interface MeetParticipantRoleUpdatedPayload {
	/** ID of the room where the participant's role was updated */
	roomId: string;
	/** Identity of the participant whose role was updated */
	participantIdentity: string;
	/** New badge assigned to the participant */
	newBadge: MeetRoomMemberUIBadge;
	/** Timestamp in milliseconds when the role update occurred */
	timestamp: number;
}

/**
 * Payload for MEET_PARTICIPANT_PERMISSIONS_UPDATED signal,
 * containing routing information for the participant that must regenerate their room member token.
 */
export interface MeetParticipantPermissionsUpdatedPayload {
	/** ID of the room where permissions were updated */
	roomId: string;
	/** Identity of the participant that must regenerate the token */
	participantIdentity: string;
	/** Timestamp in milliseconds when the permission update occurred */
	timestamp: number;
}

/**
 * Union type representing the payload of a MeetSignal.
 * It can be either a {@link MeetRoomConfigUpdatedPayload}, {@link MeetParticipantRoleUpdatedPayload}
 * or {@link MeetParticipantPermissionsUpdatedPayload}, depending on the signal type.
 */
export type MeetSignalPayload =
	| MeetRoomConfigUpdatedPayload
	| MeetParticipantRoleUpdatedPayload
	| MeetParticipantPermissionsUpdatedPayload;
