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
 * Status of captions feature based on room and global configuration
 */
export type CaptionsStatus = 'HIDDEN' | 'ENABLED' | 'DISABLED_WITH_WARNING';

/**
 * Sub-interfaces to group related feature flags
 */
export interface MediaFeatures {
	videoEnabled: boolean;
	audioEnabled: boolean;
}

export interface UIControls {
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
	 * Indicates if the flag for allowing smart layout is enabled. It's changed manually.
	 */
	showLayoutSelector: boolean;
	/**
	 * Status of captions feature based on room and global configuration
	 */
	captionsStatus: CaptionsStatus;
}

export interface PermissionsFeatures {
	/**
	 * Indicates if the user has permission to moderate the room
	 */
	canModerateRoom: boolean;
	/**
	 * Indicates if the user has permission to record the room
	 */
	canRecordRoom: boolean;
	/**
	 * Indicates if the user has permission to retrieve recordings of the room
	 */
	canRetrieveRecordings: boolean;
}

export interface AppearanceFeatures {
	hasCustomTheme: boolean;
	themeConfig?: MeetRoomTheme;
}

/**
 * Interface that defines all available features in the application
 */
export interface RoomFeatures {
	// Media capabilities
	media: MediaFeatures;

	// UI Controls
	ui: UIControls;

	// Permissions
	permissions: PermissionsFeatures;

	// Appearance
	appearance: AppearanceFeatures;
}
