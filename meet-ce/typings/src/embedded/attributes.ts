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
	 * Identifier of the local participant in your own application, to correlate it with your users.
	 * Up to 64 characters (letters, digits, `_` and `-`). Never interpreted by OpenVidu Meet.
	 */
	PARTICIPANT_EXTERNAL_ID = 'participant-external-id',
	/**
	 * Opaque application-defined payload attached to the local participant (JSON is recommended).
	 * Up to 2048 bytes (UTF-8). Never interpreted by OpenVidu Meet.
	 */
	PARTICIPANT_METADATA = 'participant-metadata',
	/**
	 * Join the meeting with the microphone active (`true`) or not (`false`). It **overrides the room's
	 * `config.initialAudioActive`**; if omitted, the room's value applies. The participant can change it
	 * afterwards, and a denied `mediaPublishAudio` permission always wins.
	 */
	INITIAL_AUDIO_ACTIVE = 'initial-audio-active',
	/**
	 * Join the meeting with the camera active (`true`) or not (`false`). It **overrides the room's
	 * `config.initialVideoActive`**; if omitted, the room's value applies. The participant can change it
	 * afterwards, and a denied `mediaPublishVideo` permission always wins.
	 */
	INITIAL_VIDEO_ACTIVE = 'initial-video-active',
	/**
	 * Language the interface starts in: `en`, `es`, `de`, `fr`, `zh` (Simplified), `hi`, `it`, `ja`,
	 * `nl` or `pt` (European). A regional variant uses its language (`pt-BR` is `pt`).
	 *
	 * It **overrides the participant's previous choice**, which they can still change. An unsupported
	 * value is ignored.
	 */
	LANGUAGE = 'language',
	/**
	 * Secret key for end-to-end encryption (E2EE).
	 * If provided, the participant will join the meeting using E2EE key.
	 */
	E2EE_KEY = 'e2ee-key',
	/**
	 * URL to redirect to when the participant dismisses the post-meeting, join, error or recording
	 * screen, right after the **`embeddedCloseRequested` event** fires.
	 */
	LEAVE_REDIRECT_URL = 'leave-redirect-url',
	/**
	 * Show only the recordings instead of the live meeting. A bare attribute or any value other than
	 * `"false"` is `true`.
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
	/** Opaque application-defined payload for the local participant (JSON recommended, ≤ 2048 bytes UTF-8). Never interpreted by Meet. */
	participantMetadata?: string;
	/** Initial microphone state (they may unmute later). Set: wins over `config.initialAudioActive`; omitted: the room decides. */
	initialAudioActive?: boolean;
	/** Initial camera state (they may activate it later). Set: wins over `config.initialVideoActive`; omitted: the room decides. */
	initialVideoActive?: boolean;
	/** Language the interface starts in: `en`, `es`, `de`, `fr`, `zh`, `hi`, `it`, `ja`, `nl` or `pt`, regional variants included (`pt-BR` is `pt`). Wins over the participant's previous choice without replacing it; they can still switch. */
	language?: string;
	/** Secret key for end-to-end encryption (E2EE). When provided the participant joins using E2EE. */
	e2eeKey?: string;
	/** URL to redirect to when the participant dismisses the post-meeting, join, error or recording screen, after `embeddedCloseRequested` fires. */
	leaveRedirectUrl?: string;
	/** When true, shows only recordings instead of live meetings. */
	showOnlyRecordings?: boolean;
	/** Identifier of the recording to display. When provided along with `room-url`, the app redirects to the recording view. */
	showRecording?: string;
}
