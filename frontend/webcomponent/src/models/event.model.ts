/**
 * All available events that can be emitted by the WebComponent.
 * @category Communication
 */
export const enum WebComponentEvent {
	/**
	 * Event emitted when the local participant joins the room.
	 */
	JOIN = 'JOIN',
	/**
	 * Event emitted when the local participant leaves the room.
	 */
	LEFT = 'LEFT',
	/**
	 * Event emitted when a moderator ends the meeting.
	 */
	MEETING_ENDED = 'MEETING_ENDED'
}

/**
 * Type definitions for event payloads.
 * Each property corresponds to an event in {@link WebComponentEvent}.
 * @category Communication
 */
export interface EventPayloads {
	[WebComponentEvent.JOIN]: {
		roomId: string;
		participantName: string;
	};
	[WebComponentEvent.LEFT]: {
		roomId: string;
		participantName: string;
	};
	[WebComponentEvent.MEETING_ENDED]: {
		roomId: string;
	};
}

/**
 * Gets the type-safe payload for a specific event.
 * This type allows TypeScript to infer the correct payload type based on the event.
 * @category Type Helpers
 * @private
 */
export type EventPayloadFor<T extends WebComponentEvent> = T extends keyof EventPayloads ? EventPayloads[T] : never;
