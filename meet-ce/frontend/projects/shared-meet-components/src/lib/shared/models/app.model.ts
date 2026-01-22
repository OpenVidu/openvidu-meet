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
	videoEnabled: boolean;
	audioEnabled: boolean;
	showCamera: boolean;
	showMicrophone: boolean;
	showScreenShare: boolean;

	// UI Features
	showRecordingPanel: boolean;
	showChat: boolean;
	showBackgrounds: boolean;
	showCaptions: boolean;
	showParticipantList: boolean;
	showSettings: boolean;
	showFullscreen: boolean;
	showThemeSelector: boolean;
	allowLayoutSwitching: boolean; // flag for allowing smart layout. It's changed manually.

	// Permissions
	canModerateRoom: boolean;
	canRecordRoom: boolean;
	canRetrieveRecordings: boolean;

	// Appearance
	hasCustomTheme: boolean;
	themeConfig?: MeetRoomTheme;
}
