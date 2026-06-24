/**
 * Enum representing the embedded (HTML attribute) properties of the OpenVidu Meet web component.
 */
export enum EmbeddedAttribute {
	/**
	 * The OpenVidu Meet room URL to connect to.
	 * @required This attribute is required unless `recording-url` is provided.
	 */
	ROOM_URL = 'room-url',
	/**
	 * The URL of a recording to view.
	 * @required This attribute is required unless `room-url` is provided.
	 */
	RECORDING_URL = 'recording-url',
	/**
	 * Display name for the local participant.
	 */
	PARTICIPANT_NAME = 'participant-name',
	/**
	 * Secret key for end-to-end encryption (E2EE).
	 * If provided, the participant will join the meeting using E2EE key.
	 */
	E2EE_KEY = 'e2ee-key',
	/**
	 * URL to redirect to when leaving the meeting.
	 * Redirection occurs after the **`CLOSED` event** fires.
	 */
	LEAVE_REDIRECT_URL = 'leave-redirect-url',
	/**
	 * Whether to show only recordings instead of live meetings.
	 */
	SHOW_ONLY_RECORDINGS = 'show-only-recordings',
	/**
	 * Recording identifier to open directly.
	 * When provided, the app redirects to `/recording/:recordingId`.
	 */
	SHOW_RECORDING = 'show-recording'
}

/**
 * Value shape of the OpenVidu Meet web component properties, keyed by the camelCase
 * JS property names (the DOM-attribute aliases are listed in {@link EmbeddedAttribute}).
 * All properties are optional; consumers that need a fully-resolved set can use `Required<…>`.
 */
export interface WebComponentPropertyValues {
	/** The OpenVidu Meet room URL to connect to. Required unless `recordingUrl` is provided. */
	roomUrl?: string;
	/** URL of a recording to view. When provided, `roomUrl` is not required. */
	recordingUrl?: string;
	/** Display name for the local participant. */
	participantName?: string;
	/** Secret key for end-to-end encryption (E2EE). When provided the participant joins using E2EE. */
	e2eeKey?: string;
	/** URL to redirect to after the `CLOSED` event fires when leaving the meeting. */
	leaveRedirectUrl?: string;
	/** When true, shows only recordings instead of live meetings. */
	showOnlyRecordings?: boolean;
	/** Recording identifier to open directly. Redirects the app to `/recording/:recordingId`. */
	showRecording?: string;
}
