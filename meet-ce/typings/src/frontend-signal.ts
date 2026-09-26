import { MeetBroadcastInfo } from './database/broadcast.entity.js';
import { MeetRecordingInfo } from './database/recording.entity.js';
import { MeetReaction } from './reaction.js';
import { MeetParticipantMuteOptions } from './request/meeting-request.js';

/**
 * Interface representing a signal emitted by OpenVidu Meet to notify clients about real-time updates in the meeting.
 */
export enum MeetSignalType {
	/** Emitted when the recording state of a meeting room is updated */
	MEET_RECORDING_UPDATED = 'meet_recording_updated',
	/** Emitted when the live broadcast state of a meeting room is updated */
	MEET_BROADCAST_UPDATED = 'meet_broadcast_updated',
	/** Emitted when a participant must regenerate their room member token to sync updated permissions */
	MEET_PARTICIPANT_PERMISSIONS_UPDATED = 'meet_participant_permissions_updated',
	/** Emitted when a moderator turns off a participant's microphone, camera or screen share */
	MEET_PARTICIPANT_MEDIA_MUTED = 'meet_participant_media_muted',
	/** Emitted to everyone in the meeting when a participant sends a reaction */
	MEET_PARTICIPANT_REACTION_SENT = 'meet_participant_reaction_sent'
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
 * Payload for MEET_BROADCAST_UPDATED signal,
 * containing the latest live broadcast state for a room.
 */
export interface MeetBroadcastUpdatedPayload {
	/** ID of the room whose broadcast state has changed */
	roomId: string;
	/** Latest broadcast state for the room */
	broadcast: MeetBroadcastInfo;
	/** Timestamp in milliseconds when the update occurred */
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
 * Payload for MEET_PARTICIPANT_REACTION_SENT signal. The server sends it on behalf of the participant
 * once it has checked the room allows reactions and the participant may send them, so the identity
 * it names is the sender's.
 */
export interface MeetParticipantReactionSentPayload {
	/** ID of the room where the reaction was sent */
	roomId: string;
	/** Identity of the participant who sent the reaction */
	participantIdentity: string;
	/** The reaction sent */
	reaction: MeetReaction;
	/** Timestamp in milliseconds when the reaction was sent */
	timestamp: number;
}

export interface MeetingChatSignalPayload {
	message: string;
}

/**
 * Union type representing the payload of a MeetSignal.
 * It can be either a {@link MeetRecordingUpdatedPayload}, {@link MeetBroadcastUpdatedPayload},
 * {@link MeetParticipantPermissionsUpdatedPayload}, {@link MeetParticipantMediaMutedPayload} or
 * {@link MeetParticipantReactionSentPayload}, depending on the signal type.
 */
export type MeetSignalPayload =
	| MeetRecordingUpdatedPayload
	| MeetBroadcastUpdatedPayload
	| MeetParticipantPermissionsUpdatedPayload
	| MeetParticipantMediaMutedPayload
	| MeetParticipantReactionSentPayload;
