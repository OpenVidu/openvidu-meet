/**
 * Enum representing the embedded (HTML attribute) properties of the OpenVidu Meet application.
 */
export enum EmbeddedAttribute {
	/**
	 * The OpenVidu Meet room URL to access to.
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
	 * Application-defined identifier for the local participant, so the embedding application can
	 * correlate the participant with one of its own users.
	 * Up to 64 characters (letters, digits, `_` and `-`). Never interpreted by OpenVidu Meet.
	 */
	PARTICIPANT_EXTERNAL_ID = 'participant-external-id',
	/**
	 * Opaque application-defined payload attached to the local participant (JSON is recommended).
	 * Up to 2 KB. Never interpreted by OpenVidu Meet.
	 */
	PARTICIPANT_METADATA = 'participant-metadata',
	/**
	 * Join the meeting with the microphone muted (`false` by default). This is the participant's
	 * initial state only: they may unmute afterwards, unlike when the `mediaPublishAudio`
	 * permission is denied.
	 */
	INITIAL_AUDIO_MUTED = 'initial-audio-muted',
	/**
	 * Join the meeting with the camera off (`false` by default). This is the participant's
	 * initial state only: they may enable it afterwards, unlike when the `mediaPublishVideo`
	 * permission is denied.
	 */
	INITIAL_VIDEO_MUTED = 'initial-video-muted',
	/**
	 * Secret key for end-to-end encryption (E2EE).
	 * If provided, the participant will join the meeting using E2EE key.
	 */
	E2EE_KEY = 'e2ee-key',
	/**
	 * URL to redirect to when leaving OpenVidu Meet.
	 * Redirection occurs after the **`CLOSED` event** fires.
	 */
	LEAVE_REDIRECT_URL = 'leave-redirect-url',
	/**
	 * Whether to show only recordings instead of live meetings.
	 */
	SHOW_ONLY_RECORDINGS = 'show-only-recordings',
	/**
	 * Identifier of the recording to display.
	 * When provided along with `room-url`, the app redirects to the recording view.
	 */
	SHOW_RECORDING = 'show-recording'
}

/**
 * Value shape of the OpenVidu Meet web component properties, keyed by the camelCase
 * JS property names (the DOM-attribute aliases are listed in {@link EmbeddedAttribute}).
 */
export interface WebComponentPropertyValues {
	/** The OpenVidu Meet room URL to access to. Required unless `recordingUrl` is provided. */
	roomUrl?: string;
	/** URL of a recording to view. When provided, `roomUrl` is not required. */
	recordingUrl?: string;
	/** Display name for the local participant. */
	participantName?: string;
	/** Application-defined identifier for the local participant (≤ 64 chars: letters, digits, `_`, `-`). Never interpreted by Meet. */
	participantExternalId?: string;
	/** Opaque application-defined payload for the local participant (JSON recommended, ≤ 2 KB). Never interpreted by Meet. */
	participantMetadata?: string;
	/** When true, the participant joins the meeting with the microphone muted (initial state only; they may unmute afterwards). */
	initialAudioMuted?: boolean;
	/** When true, the participant joins the meeting with the camera off (initial state only; they may enable it afterwards). */
	initialVideoMuted?: boolean;
	/** Secret key for end-to-end encryption (E2EE). When provided the participant joins using E2EE. */
	e2eeKey?: string;
	/** URL to redirect to after the `CLOSED` event fires when leaving OpenVidu Meet. */
	leaveRedirectUrl?: string;
	/** When true, shows only recordings instead of live meetings. */
	showOnlyRecordings?: boolean;
	/** Identifier of the recording to display. When provided along with `room-url`, the app redirects to the recording view. */
	showRecording?: string;
}
