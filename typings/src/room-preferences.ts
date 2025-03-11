/**
 * Interface representing the preferences for a room.
 */
export interface RoomPreferences {
	chatPreferences: ChatPreferences;
	recordingPreferences: RecordingPreferences;
	virtualBackgroundPreferences: VirtualBackgroundPreferences;
}
/**
 * Interface representing the preferences for recording.
 */
export interface RecordingPreferences {
	enabled: boolean;
}
export interface ChatPreferences {
	enabled: boolean;
}
export interface VirtualBackgroundPreferences {
	enabled: boolean;
}
