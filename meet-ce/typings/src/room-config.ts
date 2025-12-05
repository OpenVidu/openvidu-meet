/**
 * Interface representing the config for a room.
 */
export interface MeetRoomConfig {
    chat: MeetChatConfig;
    recording: MeetRecordingConfig;
    virtualBackground: MeetVirtualBackgroundConfig;
    e2ee: MeetE2EEConfig;
    // appearance: MeetAppearanceConfig;
}

/**
 * Interface representing the config for recordings in a room.
 */
export interface MeetRecordingConfig {
    enabled: boolean;
}

export interface MeetChatConfig {
    enabled: boolean;
}

export interface MeetVirtualBackgroundConfig {
    enabled: boolean;
}

export interface MeetE2EEConfig {
    enabled: boolean;
}

export interface MeetAppearanceConfig {
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
