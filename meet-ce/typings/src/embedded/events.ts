import { MeetRecordingStatus } from '../database/recording.entity.js';
import { MeetParticipantInfo, MeetParticipantPayload } from '../response/participant-response.js';
import type { MeetParticipantDeparturePayload } from '../webhook.js';

/**
 * All available events that can be emitted by the embedded OpenVidu Meet application.
 *
 * Canonical names follow the `moduleEvent` scheme (module first, past tense). The former bare names
 * are kept as `@deprecated` aliases and are removed in **3.12.0**: until then **both** names are
 * dispatched for every lifecycle transition, so a host listening to the old and the new name is
 * called twice. They are listed and marked deprecated in the generated documentation so a host
 * still listening for one can find it in the reference.
 * @category Communication
 */
export enum EmbeddedEventName {
	/**
	 * Event emitted when the local participant joins the meeting.
	 */
	MEETING_JOINED = 'meetingJoined',
	/**
	 * Event emitted when the local participant leaves the meeting.
	 */
	MEETING_LEFT = 'meetingLeft',
	/**
	 * Event emitted when a remote participant joins the meeting. Only live transitions are
	 * notified: participants already in the meeting when the local one joins are not replayed.
	 * The local participant's own join is notified through `meetingJoined` instead.
	 */
	PARTICIPANT_JOINED = 'participantJoined',
	/**
	 * Event emitted when a remote participant leaves the meeting.
	 * The local participant's own departure is notified through `meetingLeft` instead.
	 */
	PARTICIPANT_LEFT = 'participantLeft',
	/**
	 * Event emitted to the local participant when they are promoted to moderator or returned to their
	 * original role, once the permissions of the new role are in effect. A change made while the
	 * participant is still joining is reported after `meetingJoined`. The other participants are not
	 * notified.
	 */
	PARTICIPANT_ROLE_CHANGED = 'participantRoleChanged',
	/**
	 * Event emitted to every participant when a participant's hand is raised or lowered, by
	 * themselves or by a moderator. A participant joining a meeting with raised hands receives one
	 * event per raised hand, in queue order, right after `meetingJoined`. The queue is ordered by
	 * `participant.handRaiseDate`.
	 */
	PARTICIPANT_HAND_CHANGED = 'participantHandChanged',
	/**
	 * Event emitted to the local participant when their microphone state changes. Emitted from the
	 * prejoin screen onwards, before `meetingJoined`.
	 */
	MEDIA_AUDIO_STATUS_CHANGED = 'mediaAudioStatusChanged',
	/**
	 * Event emitted to the local participant when their camera state changes. Emitted from the
	 * prejoin screen onwards, before `meetingJoined`.
	 */
	MEDIA_VIDEO_STATUS_CHANGED = 'mediaVideoStatusChanged',
	/**
	 * Event emitted to the local participant when their screen share state changes. Emitted from the
	 * prejoin screen onwards, before `meetingJoined`.
	 */
	MEDIA_SCREEN_SHARE_STATUS_CHANGED = 'mediaScreenShareStatusChanged',
	/**
	 * Event emitted to every participant when the status of the meeting's recording changes, whoever
	 * started or stopped it. Each recording's statuses are reported in order, each at most once, and a
	 * participant joining a meeting that is being recorded receives its current status right after
	 * `meetingJoined`.
	 */
	RECORDING_STATUS_CHANGED = 'recordingStatusChanged',
	/**
	 * Event emitted when the participant asks to close OpenVidu Meet by dismissing the post-meeting,
	 * join, error or recording screen. The host application responds by removing the embedded
	 * element or routing the participant elsewhere; the meeting itself may still be running for the
	 * other participants.
	 */
	EMBEDDED_CLOSE_REQUESTED = 'embeddedCloseRequested',
	/**
	 * Event emitted when the local participant joins the meeting.
	 * @deprecated Renamed to `meetingJoined` ({@link EmbeddedEventName.MEETING_JOINED}). Removed in 3.12.0.
	 */
	JOINED = 'joined',
	/**
	 * Event emitted when the local participant leaves the meeting.
	 * @deprecated Renamed to `meetingLeft` ({@link EmbeddedEventName.MEETING_LEFT}). Removed in 3.12.0.
	 */
	LEFT = 'left',
	/**
	 * Event emitted when the participant asks to close OpenVidu Meet.
	 * @deprecated Renamed to `embeddedCloseRequested` ({@link EmbeddedEventName.EMBEDDED_CLOSE_REQUESTED}). Removed in 3.12.0.
	 */
	CLOSED = 'closed'
}

/**
 * Reason for emitting the LEFT event in OpenVidu Meet.
 */
export enum LeftEventReason {
	/** The participant left the meeting voluntarily */
	VOLUNTARY_LEAVE = 'voluntary_leave',
	/** The participant was disconnected due to network issues */
	NETWORK_DISCONNECT = 'network_disconnect',
	/** The server was shut down unexpectedly */
	SERVER_SHUTDOWN = 'server_shutdown',
	/** The participant was kicked from the meeting by a moderator */
	PARTICIPANT_KICKED = 'participant_kicked',
	/** A moderator ended the meeting for all participants */
	MEETING_ENDED = 'meeting_ended',
	/** The local participant ended the meeting for all participants */
	MEETING_ENDED_BY_SELF = 'meeting_ended_by_self',
	/** The meeting was automatically ended because it reached its configured maximum duration */
	MEETING_ENDED_BY_DURATION_LIMIT = 'meeting_ended_by_duration_limit',
	/** The participant was disconnected because the same identity joined again */
	DUPLICATE_IDENTITY = 'duplicate_identity',
	/** Unknown reason for leaving the meeting */
	UNKNOWN = 'unknown'
}

/**
 * Who caused the state change an event notifies.
 *
 * The shared value-set for every front event that attributes its change (the `origin` payload
 * field): the affected participant themselves, a moderator acting on them, or the server applying
 * room configuration (defaults, limits, timers).
 */
export enum MeetEventOrigin {
	/** The affected participant caused the change themselves */
	PARTICIPANT = 'participant',
	/** A moderator caused the change on the affected participant */
	MODERATOR = 'moderator',
	/** The server caused the change (room defaults, limits, timers) */
	SYSTEM = 'system'
}

/**
 * Type definitions for event payloads.
 * Each property corresponds to an event in {@link EmbeddedEventName}.
 *
 * A deprecated alias always carries the **same** payload as its canonical event, expressed as an
 * indexed access so the two can never drift apart.
 * @category Communication
 */
export interface EmbeddedEventPayloads {
	/**
	 * Payload for the {@link EmbeddedEventName.MEETING_JOINED} event.
	 */
	[EmbeddedEventName.MEETING_JOINED]: {
		roomId: string;
		participantIdentity: string;
	};
	/**
	 * Payload for the {@link EmbeddedEventName.MEETING_LEFT} event.
	 */
	[EmbeddedEventName.MEETING_LEFT]: {
		roomId: string;
		participantIdentity: string;
		reason: LeftEventReason;
	};
	/**
	 * Payload for the {@link EmbeddedEventName.PARTICIPANT_JOINED} event.
	 */
	[EmbeddedEventName.PARTICIPANT_JOINED]: {
		roomId: string;
		participant: MeetParticipantPayload;
	};
	/**
	 * Payload for the {@link EmbeddedEventName.PARTICIPANT_LEFT} event.
	 * `participant.leaveReason` is why the participant left, the same value the `participantLeft`
	 * webhook carries. When they left and how long they stayed are on the webhook alone: each client
	 * would tell them by its own clock.
	 */
	[EmbeddedEventName.PARTICIPANT_LEFT]: {
		roomId: string;
		participant: Omit<MeetParticipantDeparturePayload, 'leaveDate' | 'durationSeconds'>;
	};
	/**
	 * Payload for the {@link EmbeddedEventName.PARTICIPANT_ROLE_CHANGED} event.
	 * `participant` is the local participant with the role now in effect (see {@link MeetParticipantInfo}).
	 */
	[EmbeddedEventName.PARTICIPANT_ROLE_CHANGED]: {
		roomId: string;
		participant: MeetParticipantInfo;
	};
	/**
	 * Payload for the {@link EmbeddedEventName.PARTICIPANT_HAND_CHANGED} event.
	 * `participant.handRaised` is the new hand state (see {@link MeetParticipantInfo}). `origin` says
	 * who lowered the hand, the participant or a moderator; a raise always originates from the
	 * participant.
	 */
	[EmbeddedEventName.PARTICIPANT_HAND_CHANGED]: {
		roomId: string;
		participant: MeetParticipantInfo;
		origin: MeetEventOrigin.PARTICIPANT | MeetEventOrigin.MODERATOR;
	};
	/**
	 * Payload for the {@link EmbeddedEventName.MEDIA_AUDIO_STATUS_CHANGED} event.
	 * `origin` says who caused the change (see {@link MeetEventOrigin}).
	 */
	[EmbeddedEventName.MEDIA_AUDIO_STATUS_CHANGED]: {
		active: boolean;
		origin: MeetEventOrigin;
	};
	/**
	 * Payload for the {@link EmbeddedEventName.MEDIA_VIDEO_STATUS_CHANGED} event.
	 * `origin` says who caused the change (see {@link MeetEventOrigin}).
	 */
	[EmbeddedEventName.MEDIA_VIDEO_STATUS_CHANGED]: {
		active: boolean;
		origin: MeetEventOrigin;
	};
	/**
	 * Payload for the {@link EmbeddedEventName.MEDIA_SCREEN_SHARE_STATUS_CHANGED} event.
	 * `origin` says who caused the change (see {@link MeetEventOrigin}).
	 */
	[EmbeddedEventName.MEDIA_SCREEN_SHARE_STATUS_CHANGED]: {
		active: boolean;
		origin: MeetEventOrigin;
	};
	/**
	 * Payload for the {@link EmbeddedEventName.RECORDING_STATUS_CHANGED} event.
	 * `status` is the recording's new status (see {@link MeetRecordingStatus}).
	 */
	[EmbeddedEventName.RECORDING_STATUS_CHANGED]: {
		recordingId: string;
		status: MeetRecordingStatus;
	};
	/**
	 * Payload for the {@link EmbeddedEventName.JOINED} event.
	 * @deprecated Use {@link EmbeddedEventName.MEETING_JOINED}. Removed in 3.12.0.
	 */
	[EmbeddedEventName.JOINED]: EmbeddedEventPayloads[EmbeddedEventName.MEETING_JOINED];
	/**
	 * Payload for the {@link EmbeddedEventName.LEFT} event.
	 * @deprecated Use {@link EmbeddedEventName.MEETING_LEFT}. Removed in 3.12.0.
	 */
	[EmbeddedEventName.LEFT]: EmbeddedEventPayloads[EmbeddedEventName.MEETING_LEFT];
}

/**
 * Maps every deprecated event alias to the canonical event it mirrors. The embedding shells derive
 * the parallel dispatch from this map instead of hardcoding pairs.
 *
 * @deprecated This map, {@link EmbeddedDeprecatedEventName} and {@link deprecatedEmbeddedEventAliasOf}
 * only exist to support the 3.8.0 aliases below and are removed together with them in **3.12.0**.
 * @category Communication
 */
export const EMBEDDED_EVENT_ALIASES = {
	[EmbeddedEventName.JOINED]: EmbeddedEventName.MEETING_JOINED,
	[EmbeddedEventName.LEFT]: EmbeddedEventName.MEETING_LEFT,
	[EmbeddedEventName.CLOSED]: EmbeddedEventName.EMBEDDED_CLOSE_REQUESTED
} as const satisfies Readonly<Partial<Record<EmbeddedEventName, EmbeddedEventName>>>;

/**
 * A deprecated event name that aliases a canonical one.
 * @deprecated Removed in 3.12.0, together with {@link EMBEDDED_EVENT_ALIASES}.
 * @category Type Helpers
 */
export type EmbeddedDeprecatedEventName = keyof typeof EMBEDDED_EVENT_ALIASES;

/**
 * The deprecated alias of a canonical event name, or `undefined` when it has none.
 * @deprecated Once the 3.8.0 aliases are removed in 3.12.0 no canonical event has an alias, so this
 * always returns `undefined` and is removed along with them.
 * @category Type Helpers
 */
export function deprecatedEmbeddedEventAliasOf(event: EmbeddedEventName): EmbeddedDeprecatedEventName | undefined {
	const entry = Object.entries(EMBEDDED_EVENT_ALIASES).find(([, canonical]) => canonical === event);
	return entry?.[0] as EmbeddedDeprecatedEventName | undefined;
}

/**
 * Gets the type-safe payload for a specific event.
 * This type allows TypeScript to infer the correct payload type based on the event.
 * @category Type Helpers
 * @private
 */
export type EmbeddedEventPayloadFor<T extends EmbeddedEventName> = T extends keyof EmbeddedEventPayloads
	? EmbeddedEventPayloads[T]
	: never;

/**
 * Event message emitted when the local participant joins the meeting: the event name plus its payload,
 * derived from {@link EmbeddedEventPayloadFor}.
 * @category Communication
 */
export interface EmbeddedMeetingJoinedEvent {
	event: EmbeddedEventName.MEETING_JOINED;
	payload: EmbeddedEventPayloadFor<EmbeddedEventName.MEETING_JOINED>;
}

/**
 * Event message emitted when the local participant leaves the meeting: the event name plus its payload,
 * derived from {@link EmbeddedEventPayloadFor}.
 * @category Communication
 */
export interface EmbeddedMeetingLeftEvent {
	event: EmbeddedEventName.MEETING_LEFT;
	payload: EmbeddedEventPayloadFor<EmbeddedEventName.MEETING_LEFT>;
}

/**
 * Event message emitted when a remote participant joins the meeting: the event name plus its
 * payload, derived from {@link EmbeddedEventPayloadFor}.
 * @category Communication
 */
export interface EmbeddedParticipantJoinedEvent {
	event: EmbeddedEventName.PARTICIPANT_JOINED;
	payload: EmbeddedEventPayloadFor<EmbeddedEventName.PARTICIPANT_JOINED>;
}

/**
 * Event message emitted when a remote participant leaves the meeting: the event name plus its
 * payload, derived from {@link EmbeddedEventPayloadFor}.
 * @category Communication
 */
export interface EmbeddedParticipantLeftEvent {
	event: EmbeddedEventName.PARTICIPANT_LEFT;
	payload: EmbeddedEventPayloadFor<EmbeddedEventName.PARTICIPANT_LEFT>;
}

/**
 * Event message emitted to the local participant when their role changes: the event name plus its
 * payload, derived from {@link EmbeddedEventPayloadFor}.
 * @category Communication
 */
export interface EmbeddedParticipantRoleChangedEvent {
	event: EmbeddedEventName.PARTICIPANT_ROLE_CHANGED;
	payload: EmbeddedEventPayloadFor<EmbeddedEventName.PARTICIPANT_ROLE_CHANGED>;
}

/**
 * Event message emitted when a participant's hand is raised or lowered: the event name plus its
 * payload, derived from {@link EmbeddedEventPayloadFor}.
 * @category Communication
 */
export interface EmbeddedParticipantHandChangedEvent {
	event: EmbeddedEventName.PARTICIPANT_HAND_CHANGED;
	payload: EmbeddedEventPayloadFor<EmbeddedEventName.PARTICIPANT_HAND_CHANGED>;
}

/**
 * Event message emitted to the local participant when their microphone state changes: the event
 * name plus its payload, derived from {@link EmbeddedEventPayloadFor}.
 * @category Communication
 */
export interface EmbeddedMediaAudioStatusChangedEvent {
	event: EmbeddedEventName.MEDIA_AUDIO_STATUS_CHANGED;
	payload: EmbeddedEventPayloadFor<EmbeddedEventName.MEDIA_AUDIO_STATUS_CHANGED>;
}

/**
 * Event message emitted to the local participant when their camera state changes: the event name
 * plus its payload, derived from {@link EmbeddedEventPayloadFor}.
 * @category Communication
 */
export interface EmbeddedMediaVideoStatusChangedEvent {
	event: EmbeddedEventName.MEDIA_VIDEO_STATUS_CHANGED;
	payload: EmbeddedEventPayloadFor<EmbeddedEventName.MEDIA_VIDEO_STATUS_CHANGED>;
}

/**
 * Event message emitted to the local participant when their screen share state changes: the event
 * name plus its payload, derived from {@link EmbeddedEventPayloadFor}.
 * @category Communication
 */
export interface EmbeddedMediaScreenShareStatusChangedEvent {
	event: EmbeddedEventName.MEDIA_SCREEN_SHARE_STATUS_CHANGED;
	payload: EmbeddedEventPayloadFor<EmbeddedEventName.MEDIA_SCREEN_SHARE_STATUS_CHANGED>;
}

/**
 * Event message emitted when the status of the meeting's recording changes: the event name plus its
 * payload, derived from {@link EmbeddedEventPayloadFor}.
 * @category Communication
 */
export interface EmbeddedRecordingStatusChangedEvent {
	event: EmbeddedEventName.RECORDING_STATUS_CHANGED;
	payload: EmbeddedEventPayloadFor<EmbeddedEventName.RECORDING_STATUS_CHANGED>;
}

/**
 * Event message emitted when the participant asks to close OpenVidu Meet (no payload).
 * @category Communication
 */
export interface EmbeddedCloseRequestedEvent {
	event: EmbeddedEventName.EMBEDDED_CLOSE_REQUESTED;
}

/**
 * Event message emitted when the local participant joins the meeting.
 * @category Communication
 * @deprecated Use {@link EmbeddedMeetingJoinedEvent}. Removed in 3.12.0.
 */
export interface EmbeddedJoinedEvent {
	event: EmbeddedEventName.JOINED;
	payload: EmbeddedEventPayloadFor<EmbeddedEventName.JOINED>;
}

/**
 * Event message emitted when the local participant leaves the meeting.
 * @category Communication
 * @deprecated Use {@link EmbeddedMeetingLeftEvent}. Removed in 3.12.0.
 */
export interface EmbeddedLeftEvent {
	event: EmbeddedEventName.LEFT;
	payload: EmbeddedEventPayloadFor<EmbeddedEventName.LEFT>;
}

/**
 * Event message emitted when the participant asks to close OpenVidu Meet (no payload).
 * @category Communication
 * @deprecated Use {@link EmbeddedCloseRequestedEvent}. Removed in 3.12.0.
 */
export interface EmbeddedClosedEvent {
	event: EmbeddedEventName.CLOSED;
}

/**
 * Discriminated union of every event message the embedded app emits; narrow on `event`. It is drained
 * from the app's event queue and either re-emitted as a DOM `CustomEvent` (webcomponent) or posted
 * verbatim over `postMessage` (iframe integration). The queue itself only ever carries canonical
 * events; the deprecated members exist because the shells also dispatch the alias.
 * @category Communication
 */
export type EmbeddedEvent =
	| EmbeddedMeetingJoinedEvent
	| EmbeddedMeetingLeftEvent
	| EmbeddedParticipantJoinedEvent
	| EmbeddedParticipantLeftEvent
	| EmbeddedParticipantRoleChangedEvent
	| EmbeddedParticipantHandChangedEvent
	| EmbeddedMediaAudioStatusChangedEvent
	| EmbeddedMediaVideoStatusChangedEvent
	| EmbeddedMediaScreenShareStatusChangedEvent
	| EmbeddedRecordingStatusChangedEvent
	| EmbeddedCloseRequestedEvent
	| EmbeddedJoinedEvent
	| EmbeddedLeftEvent
	| EmbeddedClosedEvent;
