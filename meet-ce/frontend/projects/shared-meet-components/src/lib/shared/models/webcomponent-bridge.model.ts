import { LeftEventReason } from '@openvidu-meet/typings';
import { NavigationErrorReason } from './navigation.model';

// ─── Public API ───────────────────────────────────────────────────────────
// Events the <openvidu-meet> element re-emits as DOM CustomEvents. With
// attributes and commands, these form the element's public API.

/** Public webcomponent event names. */
export enum WebComponentEventType {
	JOINED = 'joined',
	LEFT = 'left',
	CLOSED = 'closed',
	ERROR = 'error'
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

/**
 * A fatal error the shell cannot recover from (e.g. room access revoked mid-session).
 * The WC has no error route, so this surfaces the error to the host (and the shell's
 * own error view) instead. `reason` is the underlying technical cause.
 */
export interface WebComponentErrorEvent {
	type: WebComponentEventType.ERROR;
	reason: NavigationErrorReason;
}

/** Any public event; the shell drains these and re-emits each as a DOM CustomEvent. */
export type WcEvent =
	| WebComponentJoinedEvent
	| WebComponentLeftEvent
	| WebComponentClosedEvent
	| WebComponentErrorEvent;

// ─── Internal ───────────────────────────────────────────────────────────────
// Navigation requests tell the WC which sub-component to render.

/** Internal navigation request names. */
export enum WebComponentNavigationType {
	VIEW_RECORDINGS = 'view-recordings',
	LOGIN = 'login',
	CHANGE_PASSWORD = 'change-password'
}

/** Show the room-recordings view */
export interface ViewRecordingsRequest {
	type: WebComponentNavigationType.VIEW_RECORDINGS;
	roomId: string;
}

/** Show the login view */
export interface LoginRequest {
	type: WebComponentNavigationType.LOGIN;
}

/** Show the mandatory password change view */
export interface ChangePasswordRequest {
	type: WebComponentNavigationType.CHANGE_PASSWORD;
}

/** Any internal view swap the shell performs in place of a router navigation. */
export type WcNavigationRequest = ViewRecordingsRequest | LoginRequest | ChangePasswordRequest;
