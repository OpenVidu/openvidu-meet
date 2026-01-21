import { MeetRecordingLayout } from './recording.model';

/**
 * Interface representing the config for a room.
 */
export interface MeetRoomConfig {
    /**
     * Configuration for chat feature. See {@link MeetChatConfig} for details.
     */
    chat: MeetChatConfig;
    /**
     * Configuration for recording feature. See {@link MeetRecordingConfig} for details.
     */
    recording: MeetRecordingConfig;
    /**
     * Configuration for virtual backgrounds feature. See {@link MeetVirtualBackgroundConfig} for details.
     */
    virtualBackground: MeetVirtualBackgroundConfig;
    /**
     * Configuration for end-to-end encryption feature. See {@link MeetE2EEConfig} for details.
     */
    e2ee: MeetE2EEConfig;
    // appearance: MeetAppearanceConfig;
}

/**
 * Interface representing the config for recordings in a room.
 */
export interface MeetRecordingConfig {
    /**
     * Indicates if recording is enabled in the room
     */
    enabled: boolean;
    /**
     * Layout used for recordings in the room. See {@link MeetRecordingLayout} for details.
     */
    layout?: MeetRecordingLayout;
}

export interface MeetChatConfig {
    /**
     * Indicates if chat is enabled in the room
     */
    enabled: boolean;
}

export interface MeetVirtualBackgroundConfig {
    /**
     * Indicates if virtual backgrounds are enabled in the room
     */
    enabled: boolean;
}

export interface MeetE2EEConfig {
    /**
     * Indicates if end-to-end encryption is enabled in the room
     */
    enabled: boolean;
}

export interface MeetAppearanceConfig {
    /**
     * List of themes available in the room
     */
    themes: MeetRoomTheme[];
}

export interface MeetRoomTheme {
    name: string;
    enabled: boolean;
    baseTheme: MeetRoomThemeMode;
    backgroundColor?: string;
    primaryColor?: string;
    secondaryColor?: string;
    accentColor?: string;
    surfaceColor?: string;
}

export enum MeetRoomThemeMode {
    LIGHT = 'light',
    DARK = 'dark'
}
