/**
 * AUTO-GENERATED FILE. DO NOT EDIT MANUALLY.
 * Source: contracts/openvidu-meet.contract.js
 */

/** Emitted when the local participant successfully joins the room. */
export interface OpenViduMeetJoinedDetail {
  /** Unique identifier of the room that was joined. */
  roomId: string;

  /** Unique identity of the local participant. */
  participantIdentity: string;
}

/** Emitted when the local participant leaves the room. */
export interface OpenViduMeetLeftDetail {
  /** Unique identifier of the room that was left. */
  roomId: string;

  /** Unique identity of the local participant. */
  participantIdentity: string;

  /** Reason for leaving. One of: voluntary_leave, network_disconnect, server_shutdown, participant_kicked, meeting_ended, meeting_ended_by_self, duplicate_identity, unknown. */
  reason: string;
}

/** Emitted when the application is fully closed after leaving or ending the meeting. */
export interface OpenViduMeetClosedDetail {

}

/** Emitted when the component cannot proceed with the requested mode. Includes pre-flight errors (invalid inputs, access denied) and the auth-required signal for recording playback. Hosts may use `reason` to drive their own recovery flow (e.g. show a login modal on `'auth-required'`). */
export interface OpenViduMeetErrorDetail {
  /** Discriminator describing the kind of failure. */
  reason: 'invalid-config' | 'invalid-room-url' | 'invalid-recording-id' | 'access-denied' | 'auth-required' | 'unknown';

  /** Human-readable message that mirrors the in-component error display. */
  message: string;

  /** When reason='access-denied', the underlying typed reason from the use case (a `NavigationErrorReason` value). */
  accessReason?: string;
}

/** Maps every public event name to its `CustomEvent.detail` type. */
export interface OpenViduMeetElementPayloadMap {
  'joined': OpenViduMeetJoinedDetail;
  'left': OpenViduMeetLeftDetail;
  'closed': OpenViduMeetClosedDetail;
  'error': OpenViduMeetErrorDetail;
}

/** Union of all public event names emitted by `<openvidu-meet>`. */
export type OpenViduMeetElementEventName = keyof OpenViduMeetElementPayloadMap;

/** Public properties accepted by `openvidu-meet`. */
export interface OpenViduMeetProps {
  /** The OpenVidu Meet room URL to connect to. Required unless recordingUrl is provided. */
  roomUrl?: string;

  /** URL of a recording to view. When provided, roomUrl is not required. */
  recordingUrl?: string;

  /** Display name for the local participant. */
  participantName?: string;

  /** Secret key for end-to-end encryption (E2EE). When provided the participant joins using E2EE. */
  e2eeKey?: string;

  /** URL to redirect to after the CLOSED event fires when leaving the meeting. */
  leaveRedirectUrl?: string;

  /** When true, shows only recordings instead of live meetings. */
  showOnlyRecordings?: boolean;

  /** Recording identifier to open directly. Redirects the app to /recording/:recordingId. */
  showRecording?: string;
}

/** Public DOM interface for `<openvidu-meet>`. */
export interface OpenViduMeetElement extends HTMLElement, OpenViduMeetProps {
  /** Subscribe to a meeting event with a type-safe payload callback. Returns the element for chaining. */
  on<K extends OpenViduMeetElementEventName>(eventName: K, callback: (detail: OpenViduMeetElementPayloadMap[K]) => void): this;

  /** Subscribe to a meeting event once. The handler is automatically removed after the first invocation. Returns the element for chaining. */
  once<K extends OpenViduMeetElementEventName>(eventName: K, callback: (detail: OpenViduMeetElementPayloadMap[K]) => void): this;

  /** Unsubscribe from a meeting event. If no callback is provided, all handlers for that event are removed. Returns the element for chaining. */
  off<K extends OpenViduMeetElementEventName>(eventName: K, callback?: (detail: OpenViduMeetElementPayloadMap[K]) => void): this;

  /** Ends the current meeting for all participants. Requires moderator privileges. */
  endMeeting(): void;

  /** Disconnects the local participant from the current room without ending the meeting. */
  leaveRoom(): void;

  /**
   * Kicks a participant from the meeting. Requires moderator privileges.
   * @param participantIdentity The unique identity of the participant to kick from the meeting.
   */
  kickParticipant(participantIdentity: string): void;

  /** Standard DOM listener overloads */
  addEventListener<K extends keyof HTMLElementEventMap>(type: K, listener: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void;
  addEventListener(type: 'joined', listener: (ev: CustomEvent<OpenViduMeetJoinedDetail>) => void, options?: boolean | AddEventListenerOptions): void;
  addEventListener(type: 'left', listener: (ev: CustomEvent<OpenViduMeetLeftDetail>) => void, options?: boolean | AddEventListenerOptions): void;
  addEventListener(type: 'closed', listener: (ev: CustomEvent<OpenViduMeetClosedDetail>) => void, options?: boolean | AddEventListenerOptions): void;
  addEventListener(type: 'error', listener: (ev: CustomEvent<OpenViduMeetErrorDetail>) => void, options?: boolean | AddEventListenerOptions): void;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
}

declare global {
  interface HTMLElementTagNameMap {
    'openvidu-meet': OpenViduMeetElement;
  }
}

export type OpenViduMeetElementTagName = 'openvidu-meet';
