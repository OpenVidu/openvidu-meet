import { MeetRecordingInfo } from './database/recording.entity.js';
import { MeetRoomConfig } from './database/room-config.js';
import { MeetParticipantMuteOptions } from './request/meeting-request.js';
import { MeetRoomMemberUIBadge } from './response/room-member-response.js';

/**
 * Interface representing a signal emitted by OpenVidu Meet to notify clients about real-time updates in the meeting.
 */
export enum MeetSignalType {
	/** Emitted when the recording state of a meeting room is updated */
	MEET_RECORDING_UPDATED = 'meet_recording_updated',
	/** Emitted when the configuration of a meeting room is updated */
	MEET_ROOM_CONFIG_UPDATED = 'meet_room_config_updated',
	/** Emitted when a participant's role in a meeting room is updated */
	MEET_PARTICIPANT_ROLE_UPDATED = 'meet_participant_role_updated',
	/** Emitted when a participant must regenerate their room member token to sync updated permissions */
	MEET_PARTICIPANT_PERMISSIONS_UPDATED = 'meet_participant_permissions_updated',
	/** Emitted when a moderator turns off a participant's microphone, camera or screen share */
	MEET_PARTICIPANT_MEDIA_MUTED = 'meet_participant_media_muted',
	/** Emitted once per meeting when a duration-limited meeting is about to reach its limit and be force-ended */
	MEET_MEETING_ENDING_SOON = 'meet_meeting_ending_soon',
	/** Emitted when a moderator's own request to end the meeting has been validated, just before the room actually closes */
	MEET_MEETING_ENDED_BY_MODERATOR = 'meet_meeting_ended_by_moderator'
}

/**
 * Payload for MEET_RECORDING_UPDATED signal,
 * containing the latest recording state for a room.
 */
export interface MeetRecordingUpdatedPayload {
	/** ID of the room whose recording state has changed */
	roomId: string;
	/** Latest recording state for the room */
	recording: MeetRecordingInfo;
	/** Timestamp in milliseconds when the update occurred */
	timestamp: number;
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
 * Payload for MEET_PARTICIPANT_MEDIA_MUTED signal, telling the affected participants which of their
 * devices a moderator just turned off. The signal is addressed to exactly those participants, so
 * the payload names the devices and not who they belong to.
 *
 * The mute itself travels through LiveKit, which stops the tracks on its own; this signal is what
 * lets the client attribute the change to a moderator and stop asking for a device the moderator
 * closed.
 */
export interface MeetParticipantMediaMutedPayload {
	/** ID of the room where the participants were muted */
	roomId: string;
	/** The devices that were turned off */
	media: MeetParticipantMuteOptions;
	/** Timestamp in milliseconds when the mute occurred */
	timestamp: number;
}

/**
 * Payload for MEET_MEETING_ENDING_SOON signal,
 * warning every participant that the meeting is about to reach its duration limit
 * (`maxDurationMinutes`) and will be ended for everyone.
 */
export interface MeetMeetingEndingSoonPayload {
	/** ID of the room whose meeting is about to be ended */
	roomId: string;
	/** Approximate minutes (rounded up, always >= 1) until the meeting is force-ended */
	remainingMinutes: number;
	/** Timestamp in milliseconds when the warning was emitted */
	timestamp: number;
}

/**
 * Payload for MEET_MEETING_ENDED_BY_MODERATOR signal, telling every participant that a moderator's
 * own request to end the meeting was just validated and the room is about to close — sent before
 * the room actually closes, so a client that locally attributed an earlier `MEET_MEETING_ENDING_SOON`
 * warning to the duration limit can correct itself before it sees the room disconnect.
 */
export interface MeetMeetingEndedByModeratorPayload {
	/** ID of the room whose meeting is about to be ended */
	roomId: string;
	/** Timestamp in milliseconds when the request was validated */
	timestamp: number;
}

export interface MeetingChatSignalPayload {
	message: string;
}

/**
 * Union type representing the payload of a MeetSignal.
 * It can be either a {@link MeetRecordingUpdatedPayload}, {@link MeetRoomConfigUpdatedPayload},
 * {@link MeetParticipantRoleUpdatedPayload}, {@link MeetParticipantPermissionsUpdatedPayload},
 * {@link MeetParticipantMediaMutedPayload}, {@link MeetMeetingEndingSoonPayload} or
 * {@link MeetMeetingEndedByModeratorPayload}, depending on the signal type.
 */
export type MeetSignalPayload =
	| MeetRecordingUpdatedPayload
	| MeetRoomConfigUpdatedPayload
	| MeetParticipantRoleUpdatedPayload
	| MeetParticipantPermissionsUpdatedPayload
	| MeetParticipantMediaMutedPayload
	| MeetMeetingEndingSoonPayload
	| MeetMeetingEndedByModeratorPayload;
