import { LeftEventReason } from '@openvidu-meet/typings';

// ─── Public API ───────────────────────────────────────────────────────────
// Events the <openvidu-meet> element re-emits as DOM CustomEvents. With
// attributes and commands, these form the element's public API.

/** Public webcomponent event names. */
export enum WebComponentEventType {
	JOINED = 'joined',
	LEFT = 'left',
	CLOSED = 'closed'
}

/** Local participant joined the room. */
export interface WebComponentJoinedEvent {
	type: WebComponentEventType.JOINED;
	roomId: string;
	participantIdentity: string;
}

/** Local participant left the room. `reason` distinguishes voluntary leaves from drops, kicks, shutdowns, etc. */
export interface WebComponentLeftEvent {
	type: WebComponentEventType.LEFT;
	roomId: string;
	participantIdentity: string;
	reason: LeftEventReason;
}

/** Post-meeting/post-recording flow finished; the host may unmount the element. */
export interface WebComponentClosedEvent {
	type: WebComponentEventType.CLOSED;
}

/** Any public event; the shell drains these and re-emits each as a DOM CustomEvent. */
export type WcEvent = WebComponentJoinedEvent | WebComponentLeftEvent | WebComponentClosedEvent;

// ─── Internal ───────────────────────────────────────────────────────────────
// Navigation requests tell the WC which sub-component to render.

/** Internal navigation request names. */
export enum WebComponentNavigationType {
	VIEW_RECORDINGS = 'view-recordings'
}

/** Show the room-recordings view */
export interface ViewRecordingsRequest {
	type: WebComponentNavigationType.VIEW_RECORDINGS;
	roomId: string;
}

/** Any internal view swap the shell performs in place of a router navigation. */
export type WcNavigationRequest = ViewRecordingsRequest;
