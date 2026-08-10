/**
 * All available events that can be emitted by the embedded OpenVidu Meet application.
 *
 * Canonical names follow the `moduleEvent` scheme (module first, past tense). The former bare names
 * are kept as `@deprecated` aliases and are removed in **3.12.0**: until then **both** names are
 * dispatched for every lifecycle transition, so a host listening to the old and the new name is
 * called twice. They are excluded from the generated documentation so new integrations only see
 * canonical names.
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
	 * Event emitted when the application is closed.
	 */
	MEETING_CLOSED = 'meetingClosed',
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
	 * Event emitted when the application is closed.
	 * @deprecated Renamed to `meetingClosed` ({@link EmbeddedEventName.MEETING_CLOSED}). Removed in 3.12.0.
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
	/** The participant was disconnected because the same identity joined again */
	DUPLICATE_IDENTITY = 'duplicate_identity',
	/** Unknown reason for leaving the meeting */
	UNKNOWN = 'unknown'
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
	[EmbeddedEventName.CLOSED]: EmbeddedEventName.MEETING_CLOSED
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
 * Event message emitted when the application closes (no payload).
 * @category Communication
 */
export interface EmbeddedMeetingClosedEvent {
	event: EmbeddedEventName.MEETING_CLOSED;
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
 * Event message emitted when the application closes (no payload).
 * @category Communication
 * @deprecated Use {@link EmbeddedMeetingClosedEvent}. Removed in 3.12.0.
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
	| EmbeddedMeetingClosedEvent
	| EmbeddedJoinedEvent
	| EmbeddedLeftEvent
	| EmbeddedClosedEvent;
