import { MeetRecordingInfo } from './database/recording.entity.js';
import { MeetRoom } from './database/room.entity.js';
import { LeftEventReason } from './embedded/events.js';
import { MeetParticipantPayload } from './response/participant-response.js';

/**
 * Interface representing a webhook event emitted by OpenVidu Meet.
 */
export interface MeetWebhookEvent {
	/** Timestamp in milliseconds since epoch when the event was created */
	creationDate: number;
	/** Type of the webhook event. See {@link MeetWebhookEventType} for details. */
	event: MeetWebhookEventType;
	/** Payload of the webhook event, containing relevant data about the event. See {@link MeetWebhookPayload} for details. */
	data: MeetWebhookPayload;
}

/**
 * Webhook event types that can be emitted by OpenVidu Meet.
 */
export enum MeetWebhookEventType {
	/** Emitted when a meeting starts in a room */
	MEETING_STARTED = 'meetingStarted',
	/** Emitted when a meeting ends in a room */
	MEETING_ENDED = 'meetingEnded',
	/** Emitted when a participant joins a meeting */
	PARTICIPANT_JOINED = 'participantJoined',
	/** Emitted when a participant leaves a meeting */
	PARTICIPANT_LEFT = 'participantLeft',
	/** Emitted when a recording starts in a room */
	RECORDING_STARTED = 'recordingStarted',
	/** Emitted when a recording is updated */
	RECORDING_UPDATED = 'recordingUpdated',
	/** Emitted when a recording ends */
	RECORDING_ENDED = 'recordingEnded'
}

/**
 * Envelope sent to a webhook's URL by the `webhookTest` endpoint, to verify it is reachable. Distinct
 * from {@link MeetWebhookEvent}: `event` is the fixed literal `'testEvent'` rather than a
 * {@link MeetWebhookEventType} member, since this delivery reports no real occurrence. It is not
 * filterable through a webhook's `events` subscription list and is not part of the naming charter's
 * `moduleEvent` scheme. A receiver validating `event` against {@link MeetWebhookEventType} should
 * treat this literal as a recognized, benign test delivery rather than reject it.
 */
export interface MeetWebhookTestEvent {
	/** Always `'testEvent'`. */
	event: 'testEvent';
	/** Timestamp in milliseconds since epoch when the test event was created */
	creationDate: number;
	/** Fixed test payload; carries no information about any real occurrence */
	data: {
		message: string;
	};
}

/**
 * A participant that has left a meeting, as carried by the
 * {@link MeetWebhookEventType.PARTICIPANT_LEFT} webhook event.
 *
 * How and when the participant left describes that participant's own session, not the room: when
 * several participants leave, each one has its own departure time, duration and reason. They
 * therefore sit next to {@link MeetParticipantPayload.joinDate} rather than beside the room fields.
 */
export interface MeetParticipantDeparturePayload extends MeetParticipantPayload {
	/** Timestamp in milliseconds since epoch when the participant left the meeting */
	leaveDate: number;
	/** Duration in seconds the participant stayed in the meeting */
	durationSeconds: number;
	/** Reason why the participant left the meeting. See {@link LeftEventReason} for details */
	leaveReason: LeftEventReason;
}

/**
 * Why a meeting was force-ended rather than ended normally (a moderator ended it, or the room
 * emptied out), as carried by the {@link MeetWebhookEventType.MEETING_ENDED} webhook event.
 */
export enum MeetMeetingEndedCause {
	/** The meeting reached its configured maximum duration and was force-ended by the server */
	MAX_DURATION_REACHED = 'max_duration_reached'
}

/**
 * Payload for the {@link MeetWebhookEventType.MEETING_ENDED} webhook event.
 */
export interface MeetMeetingEndedPayload extends MeetRoom {
	/** Set only when the meeting was force-ended. Absent for a normal end. See {@link MeetMeetingEndedCause} for details */
	cause?: MeetMeetingEndedCause;
}

/**
 * Payload for the {@link MeetWebhookEventType.PARTICIPANT_JOINED} webhook event.
 */
export interface MeetParticipantJoinedPayload {
	/** Identifier of the room the participant joined */
	roomId: string;
	/** Name of the room the participant joined */
	roomName: string;
	/** The participant that joined. See {@link MeetParticipantPayload} for details */
	participant: MeetParticipantPayload;
}

/**
 * Payload for the {@link MeetWebhookEventType.PARTICIPANT_LEFT} webhook event.
 */
export interface MeetParticipantLeftPayload extends MeetParticipantJoinedPayload {
	/** The participant that left. See {@link MeetParticipantDeparturePayload} for details */
	participant: MeetParticipantDeparturePayload;
}

/**
 * Payload for OpenVidu Meet webhook events.
 * Depending on the event type, the payload can be {@link MeetRecordingInfo}, {@link MeetRoom},
 * {@link MeetMeetingEndedPayload}, {@link MeetParticipantJoinedPayload} or
 * {@link MeetParticipantLeftPayload}.
 */
export type MeetWebhookPayload =
	MeetRecordingInfo | MeetRoom | MeetMeetingEndedPayload | MeetParticipantJoinedPayload | MeetParticipantLeftPayload;
