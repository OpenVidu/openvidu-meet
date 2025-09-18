/**
 * Interface representing the config for a room.
 */
export interface MeetRoomConfig {
    chat: MeetChatConfig;
    recording: MeetRecordingConfig;
    virtualBackground: MeetVirtualBackgroundConfig;
}

/**
 * Interface representing the config for recordings in a room.
 */
export interface MeetRecordingConfig {
    enabled: boolean;
    allowAccessTo?: MeetRecordingAccess;
}

export const enum MeetRecordingAccess {
    ADMIN = 'admin', // Only admins can access the recording
    ADMIN_MODERATOR = 'admin_moderator', // Admins and moderators can access
    ADMIN_MODERATOR_SPEAKER = 'admin_moderator_speaker' // Admins, moderators and speakers can access
}

export interface MeetChatConfig {
    enabled: boolean;
}

export interface MeetVirtualBackgroundConfig {
    enabled: boolean;
}
