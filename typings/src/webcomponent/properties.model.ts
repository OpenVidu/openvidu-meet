export enum WebComponentProperty {

	/**
	 * The OpenVidu Meet room URL to connect to (moderator or publisher url)
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
	 * URL to redirect to when leaving the meeting.
	 * Redirection occurs after the **`CLOSED` event** fires.
	 */
	LEAVE_REDIRECT_URL = 'leave-redirect-url',
	/**
	 * Whether to show only recordings instead of live meetings.
	 */
	SHOW_ONLY_RECORDINGS = 'show-only-recordings'
}
