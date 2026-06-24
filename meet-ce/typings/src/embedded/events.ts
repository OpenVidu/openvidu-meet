/**
 * All available events that can be emitted by the WebComponent.
 * @category Communication
 */
export enum EmbeddedEvent {
	/**
	 * Event emitted when application is ready to receive commands.
	 * @private
	 */
	READY = 'ready',
	/**
	 * Event emitted when the local participant joins the room.
	 */
	JOINED = 'joined',
	/**
	 * Event emitted when the local participant leaves the room.
	 */
	LEFT = 'left',
	/**
	 * Event emitted when the application is closed.
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
 * Each property corresponds to an event in {@link EmbeddedEvent}.
 * @category Communication
 */
export interface EmbeddedEventPayloads {
	/**
	 * Payload for the {@link EmbeddedEvent.READY} event.
	 * @private
	 */
	[EmbeddedEvent.READY]: {};
	/**
	 * Payload for the {@link EmbeddedEvent.JOINED} event.
	 */
	[EmbeddedEvent.JOINED]: {
		roomId: string;
		participantIdentity: string;
	};
	/**
	 * Payload for the {@link EmbeddedEvent.LEFT} event.
	 */
	[EmbeddedEvent.LEFT]: {
		roomId: string;
		participantIdentity: string;
		reason: LeftEventReason;
	};
}

/**
 * Gets the type-safe payload for a specific event.
 * This type allows TypeScript to infer the correct payload type based on the event.
 * @category Type Helpers
 * @private
 */
export type EmbeddedEventPayloadFor<T extends EmbeddedEvent> = T extends keyof EmbeddedEventPayloads
	? EmbeddedEventPayloads[T]
	: never;
