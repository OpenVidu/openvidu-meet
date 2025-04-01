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
}
export interface MeetChatPreferences {
	enabled: boolean;
}
export interface MeetVirtualBackgroundPreferences {
	enabled: boolean;
}
