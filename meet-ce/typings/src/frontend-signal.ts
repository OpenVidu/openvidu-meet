import { MeetRoomConfig } from './database/room-config.js';
import { MeetRoomMemberRole } from './database/room-member.entity.js';

/**
 * Interface representing a signal emitted by OpenVidu Meet to notify clients about real-time updates in the meeting.
 */
export enum MeetSignalType {
	/** Emitted when the configuration of a meeting room is updated */
	MEET_ROOM_CONFIG_UPDATED = 'meet_room_config_updated',
	/** Emitted when a participant's role in a meeting room is updated */
	MEET_PARTICIPANT_ROLE_UPDATED = 'meet_participant_role_updated'
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
 * containing information about the participant whose role was updated and the new role.
 */
export interface MeetParticipantRoleUpdatedPayload {
	/** ID of the room where the participant's role was updated */
	roomId: string;
	/** Identity of the participant whose role was updated */
	participantIdentity: string;
	/** New role assigned to the participant */
	newRole: MeetRoomMemberRole;
	/** Optional secret for regenerating the participant's token if needed */
	secret?: string;
	/** Timestamp in milliseconds when the role update occurred */
	timestamp: number;
}

/**
 * Union type representing the payload of a MeetSignal.
 * It can be either a {@link MeetRoomConfigUpdatedPayload} or a {@link MeetParticipantRoleUpdatedPayload}, depending on the signal type.
 */
export type MeetSignalPayload = MeetRoomConfigUpdatedPayload | MeetParticipantRoleUpdatedPayload;
