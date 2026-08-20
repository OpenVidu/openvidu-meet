/**
 * Status of captions feature based on room and global configuration
 */
export type CaptionsStatus = 'HIDDEN' | 'ENABLED' | 'DISABLED_WITH_WARNING';

/**
 * What the embedding application asked for through the initial-audio-enabled / initial-video-enabled
 * embed attributes (or their URL query params). `undefined` per device means the host said nothing,
 * which is **not** the same as `true`: only a value that is set outranks the room's own
 * `config.initial*Enabled`.
 */
export interface InitialMediaRequest {
	audioEnabled?: boolean;
	videoEnabled?: boolean;
}

/**
 * Interface that defines all available features in the application
 */
export interface RoomFeatures {
	/**
	 * Indicates if camera control is shown in the UI
	 */
	showCamera: boolean;
	/**
	 * Indicates if microphone control is shown in the UI
	 */
	showMicrophone: boolean;
	/**
	 * Indicates if screen share control is shown in the UI
	 */
	showScreenShare: boolean;

	/**
	 * Indicates if the recording controls is shown in the UI
	 */
	showStartStopRecording: boolean;
	/**
	 * Indicates if the view recordings controls is shown in the UI
	 */
	showViewRecordings: boolean;

	/**
	 * Indicates if the fullscreen control is shown in the UI
	 */
	showFullscreen: boolean;
	/**
	 * Indicates if the virtual backgrounds feature is shown in the UI
	 */
	showBackgrounds: boolean;
	/**
	 * Indicates if the captions controls (like toggle captions button) is shown in the UI
	 */
	showCaptionsControls: boolean;
	/**
	 * Indicates if the captions controls are shown but disabled in the UI, with a warning that captions are globally disabled
	 */
	showCaptionsControlsDisabled: boolean;

	/**
	 * Indicates if the chat panel is shown in the UI
	 */
	showChat: boolean;
	/**
	 * Indicates if the chat message input is enabled (the participant may send messages).
	 * When false the chat panel is still readable but the input is disabled.
	 */
	showChatInput: boolean;
	/**
	 * Indicates if the participant list is shown in the UI
	 */
	showParticipantList: boolean;

	/**
	 * Indicates if the settings panel is shown in the UI
	 */
	showSettings: boolean;
	/**
	 * Indicates if the theme selector is shown in the UI
	 */
	showThemeSelector: boolean;
	/**
	 * Indicates if the flag for allowing smart layout is enabled.
	 *
	 * It's changed manually (not based on permissions or room config).
	 */
	showLayoutSelector: boolean;

	/**
	 * Indicates if the share access links controls is shown in the UI
	 */
	showShareAccessLinks: boolean;
	/**
	 * Indicates if the end meeting controls is shown in the UI
	 */
	showEndMeeting: boolean;
	/**
	 * Indicates if the make moderator controls is shown in the UI
	 */
	showMakeModerator: boolean;
	/**
	 * Indicates if the kick participants controls is shown in the UI
	 */
	showKickParticipants: boolean;

	/**
	 * Indicates if the join meeting controls is shown in the UI
	 */
	showJoinMeeting: boolean;
}
