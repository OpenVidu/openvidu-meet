/**
 * Interface representing the preferences for a room.
 */
export interface MeetRoomPreferences {
    chatPreferences: MeetChatPreferences;
    recordingPreferences: MeetRecordingPreferences;
    virtualBackgroundPreferences: MeetVirtualBackgroundPreferences;
}

/**
 * Interface representing the preferences for recording.
 */
export interface MeetRecordingPreferences {
    enabled: boolean;
    allowAccessTo?: MeetRecordingAccess;
}

export const enum MeetRecordingAccess {
    ADMIN = 'admin', // Only admins can access the recording
    ADMIN_MODERATOR = 'admin_moderator', // Admins and moderators can access
    ADMIN_MODERATOR_SPEAKER = 'admin_moderator_speaker' // Admins, moderators and speakers can access
}

export interface MeetChatPreferences {
    enabled: boolean;
}

export interface MeetVirtualBackgroundPreferences {
    enabled: boolean;
}
