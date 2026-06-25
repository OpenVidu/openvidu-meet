import type { EmbeddedEvent, EmbeddedEventPayloads } from '@openvidu-meet/typings';

/** `CustomEvent.detail` payload for the element's `joined` event. */
export type OpenViduMeetJoinedDetail = EmbeddedEventPayloads[EmbeddedEvent.JOINED];

/** `CustomEvent.detail` payload for the element's `left` event. */
export type OpenViduMeetLeftDetail = EmbeddedEventPayloads[EmbeddedEvent.LEFT];

/**
 * Minimal typing for the `<openvidu-meet>` custom element registered by the
 * OpenVidu Meet bundle (loaded via the backend `<script>`).
 *
 * A host that consumes only the bundle declares the subset of the element's API
 * it actually uses — this is that subset, used by the testapp to type its
 * `viewChild` element reference and imperative calls.
 */
export interface OpenViduMeetElement extends HTMLElement {
	endMeeting(): void;
	leaveRoom(): void;
	kickParticipant(participantIdentity: string): void;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	on(eventName: string, callback: (detail: any) => void): this;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	once(eventName: string, callback: (detail: any) => void): this;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	off(eventName: string, callback?: (detail: any) => void): this;
}
