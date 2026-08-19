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
	 * Join the meeting with the microphone enabled. This is the participant's initial state only:
	 * they may mute afterwards.
	 *
	 * Setting it — to either value — **takes precedence over the room's own
	 * `config.audioEnabledOnJoin`**; leaving it out means "no opinion", so the room's value applies
	 * (and `true` when the room has none either). The `mediaPublishAudio` permission is not part of
	 * that chain: it is a capability, and a denial always wins.
	 */
	INITIAL_AUDIO_ENABLED = 'initial-audio-enabled',
	/**
	 * Join the meeting with the camera enabled. This is the participant's initial state only: they
	 * may disable it afterwards.
	 *
	 * Setting it — to either value — **takes precedence over the room's own
	 * `config.videoEnabledOnJoin`**; leaving it out means "no opinion", so the room's value applies
	 * (and `true` when the room has none either). The `mediaPublishVideo` permission is not part of
	 * that chain: it is a capability, and a denial always wins.
	 */
	INITIAL_VIDEO_ENABLED = 'initial-video-enabled',
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
	/** Initial microphone state; they may unmute afterwards. Set: wins over the room's `audioEnabledOnJoin`. Omitted: the room decides. */
	initialAudioEnabled?: boolean;
	/** Initial camera state; they may enable it afterwards. Set: wins over the room's `videoEnabledOnJoin`. Omitted: the room decides. */
	initialVideoEnabled?: boolean;
	/** Secret key for end-to-end encryption (E2EE). When provided the participant joins using E2EE. */
	e2eeKey?: string;
	/** URL to redirect to after the `CLOSED` event fires when leaving OpenVidu Meet. */
	leaveRedirectUrl?: string;
	/** When true, shows only recordings instead of live meetings. */
	showOnlyRecordings?: boolean;
	/** Identifier of the recording to display. When provided along with `room-url`, the app redirects to the recording view. */
	showRecording?: string;
}
