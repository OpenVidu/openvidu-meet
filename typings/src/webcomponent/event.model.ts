/**
 * All available events that can be emitted by the WebComponent.
 * @category Communication
 */
export enum WebComponentEvent {
    /**
     * Event emitted when application is ready to receive commands.
     * @private
     */
    READY = 'READY',
    /**
     * Event emitted when the local participant joins the room.
     */
    JOINED = 'JOINED',
    /**
     * Event emitted when the local participant leaves the room.
     */
    LEFT = 'LEFT',
    /**
     * Event emitted when the application is closed.
     */
    CLOSED = 'CLOSED'
}

/**
 * Reason for emitting the LEFT event in OpenVidu Meet.
 */
export enum LeftEventReason {
    VOLUNTARY_LEAVE = 'voluntary_leave', // The participant left the meeting voluntarily
    NETWORK_DISCONNECT = 'network_disconnect', // The participant was disconnected due to network issues
    SERVER_SHUTDOWN = 'server_shutdown', // The server was shut down
    PARTICIPANT_KICKED = 'participant_kicked', // The participant was removed from the meeting by a moderator
    MEETING_ENDED = 'meeting_ended', // The meeting was ended by a moderator or the room was deleted
    MEETING_ENDED_BY_SELF = 'meeting_ended_by_self', // The local participant ended the meeting
    UNKNOWN = 'unknown' // An unknown reason for leaving the meeting
}

/**
 * Type definitions for event payloads.
 * Each property corresponds to an event in {@link WebComponentEvent}.
 * @category Communication
 */
export interface WebComponentEventPayloads {
    /**
     * Payload for the {@link WebComponentEvent.READY} event.
     * @private
     */
    [WebComponentEvent.READY]: {};
    [WebComponentEvent.JOINED]: {
        roomId: string;
        participantIdentity: string;
    };
    [WebComponentEvent.LEFT]: {
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
export type WebComponentEventPayloadFor<T extends WebComponentEvent> = T extends keyof WebComponentEventPayloads
    ? WebComponentEventPayloads[T]
    : never;
