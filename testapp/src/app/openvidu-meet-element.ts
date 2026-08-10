import { EmbeddedEventName, EmbeddedEventPayloadFor } from '@openvidu-meet/typings';

/**
 * Minimal typing for the `<openvidu-meet>` custom element registered by the
 * OpenVidu Meet bundle (loaded via the backend `<script>`).
 *
 * A host that consumes only the bundle declares the subset of the element's API
 * it actually uses — this is that subset, used by the testapp to type its
 * `viewChild` element reference and imperative calls.
 */
export interface OpenViduMeetElement extends HTMLElement {
	meetingEnd(): void;
	meetingLeave(): void;
	participantKick(participantIdentity: string): void;
	/** @deprecated Renamed to `meetingEnd()`. Removed in 3.12.0. Declared so the e2e can drive it. */
	endMeeting(): void;
	/** @deprecated Renamed to `meetingLeave()`. Removed in 3.12.0. Declared so the e2e can drive it. */
	leaveRoom(): void;
	/** @deprecated Renamed to `participantKick()`. Removed in 3.12.0. Declared so the e2e can drive it. */
	kickParticipant(participantIdentity: string): void;
	on(
		eventName: EmbeddedEventName,
		callback: (eventPayload: EmbeddedEventPayloadFor<EmbeddedEventName>) => void
	): this;
	once(
		eventName: EmbeddedEventName,
		callback: (eventPayload: EmbeddedEventPayloadFor<EmbeddedEventName>) => void
	): this;
	off(
		eventName: EmbeddedEventName,
		callback?: (eventPayload: EmbeddedEventPayloadFor<EmbeddedEventName>) => void
	): this;
}
