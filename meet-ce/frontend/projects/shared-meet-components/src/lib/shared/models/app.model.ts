import { MeetRoomTheme } from '@openvidu-meet/typings';

export interface AppData {
	mode: ApplicationMode;
	edition: Edition;
	version: string;
}

export enum ApplicationMode {
	EMBEDDED = 'embedded',
	STANDALONE = 'standalone'
}

export enum Edition {
	CE = 'CE',
	PRO = 'PRO'
}

/**
 * Interface that defines all available features in the application
 */
export interface ApplicationFeatures {
	// Media Features
	/**
	 * Indicates if video is enabled for the participant
	 */
	videoEnabled: boolean;

	/**
	 * Indicates if audio is enabled for the participant
	 */
	audioEnabled: boolean;


	// UI Controls
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
	 * Indicates if the recording panel is shown in the UI
	 */
	showRecordingPanel: boolean;

	/**
	 * Indicates if the chat panel is shown in the UI
	 */
	showChat: boolean;

	/**
	 * Indicates if the virtual backgrounds feature is shown in the UI
	 */
	showBackgrounds: boolean;

	/**
	 * Indicates if the participant list is shown in the UI
	 */
	showParticipantList: boolean;

	/**
	 * Indicates if the settings panel is shown in the UI
	 */
	showSettings: boolean;

	/**
	 * Indicates if the fullscreen control is shown in the UI
	 */
	showFullscreen: boolean;

	/**
	 * Indicates if the theme selector is shown in the UI
	 */
	showThemeSelector: boolean;

	/**
	 * Flag for allowing smart layout. It's changed manually.
	 */
	allowLayoutSwitching: boolean;

	// Permissions
	canModerateRoom: boolean;
	canRecordRoom: boolean;
	canRetrieveRecordings: boolean;

	// Appearance
	hasCustomTheme: boolean;
	themeConfig?: MeetRoomTheme;
}
