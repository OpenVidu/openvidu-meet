import { MeetRecordingEncodingOptions, MeetRecordingEncodingPreset, MeetRecordingLayout } from './recording.entity.js';

/**
 * Interface representing the config for a room.
 */
export interface MeetRoomConfig {
	/**
	 * Maximum number of participants that may be in the meeting at the same time.
	 * Once reached, further join attempts are rejected.
	 * `null` (or an absent key) means the number of participants is unlimited.
	 */
	maxParticipants?: number | null;
	/**
	 * Maximum duration of the meeting in minutes. When reached, the meeting ends for every
	 * participant, exactly as if a moderator had ended it.
	 * `null` (or an absent key) means the meeting duration is unlimited.
	 */
	maxDurationMinutes?: number | null;
	/**
	 * Room-wide **default** for whether participants join with their microphone enabled. This is the
	 * initial state, not a capability: the participant may re-enable the device afterwards, and a
	 * denying `mediaPublishAudio` permission always wins.
	 *
	 * It is a default, not a policy: the embedding application's `initial-audio-enabled` attribute
	 * takes precedence whenever it is set (to either value). To *enforce* silence, deny the
	 * permission instead. `true` when absent.
	 */
	audioEnabledOnJoin?: boolean;
	/**
	 * Room-wide **default** for whether participants join with their camera enabled. This is the
	 * initial state, not a capability: the participant may re-enable the device afterwards, and a
	 * denying `mediaPublishVideo` permission always wins.
	 *
	 * It is a default, not a policy: the embedding application's `initial-video-enabled` attribute
	 * takes precedence whenever it is set (to either value). To *enforce* a camera-off meeting, deny
	 * the permission instead. `true` when absent.
	 */
	videoEnabledOnJoin?: boolean;
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
	/**
	 * Configuration for captions feature. See {@link MeetRoomCaptionsConfig} for details.
	 */
	captions: MeetRoomCaptionsConfig;
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
	 * When set, the recording starts automatically once the configured participant threshold is
	 * reached — see {@link MeetRecordingAutoStartMode} for the available thresholds. The start is
	 * attributed to the system: no participant holding the `recordingControl` permission is
	 * involved. Ignored while end-to-end encryption is enabled, which already excludes recording.
	 * `null` (or an absent key) means recordings only start on demand. Config updates deep-merge
	 * with the stored config, so omitting this field keeps its current value; send `null` to turn
	 * auto-start off.
	 */
	autoStart?: MeetRecordingAutoStartMode | null;
	/**
	 * Layout used for recordings in the room. See {@link MeetRecordingLayout} for details.
	 */
	layout?: MeetRecordingLayout;
	/**
	 * Encoding configuration: use a preset string for common scenarios,
	 * or provide detailed options for fine-grained control.
	 */
	encoding?: MeetRecordingEncodingPreset | MeetRecordingEncodingOptions;
}

/**
 * Determines when a room's recording starts automatically. See
 * {@link MeetRecordingConfig.autoStart} for details.
 */
export enum MeetRecordingAutoStartMode {
	/** Starts as soon as the first participant joins the meeting. */
	WHEN_FIRST_PARTICIPANT_JOINS = 'when_first_participant_joins',
	/** Starts as soon as a second participant joins the meeting. */
	WHEN_SECOND_PARTICIPANT_JOINS = 'when_second_participant_joins',
	/** Starts as soon as a participant with the moderator role joins the meeting. */
	WHEN_MODERATOR_JOINS = 'when_moderator_joins'
}

/**
 * Interface representing the config for chat in a room.
 */
export interface MeetChatConfig {
	/**
	 * Indicates if chat is enabled in the room
	 */
	enabled: boolean;
}

/**
 * Interface representing the config for virtual backgrounds in a room.
 */
export interface MeetVirtualBackgroundConfig {
	/**
	 * Indicates if virtual backgrounds are enabled in the room
	 */
	enabled: boolean;
}

/**
 * Interface representing the config for end-to-end encryption in a room.
 */
export interface MeetE2EEConfig {
	/**
	 * Indicates if end-to-end encryption is enabled in the room
	 */
	enabled: boolean;
}

/**
 * Interface representing the config for captions in a room.
 */
export interface MeetRoomCaptionsConfig {
	/**
	 * Indicates if captions are enabled in the room
	 */
	enabled: boolean;
}

/**
 * Interface representing the appearance configuration for a room.
 */
export interface MeetAppearanceConfig {
	/**
	 * List of themes available in the room
	 */
	themes: MeetRoomTheme[];
}

/**
 * Interface representing a theme for a room's appearance.
 */
export interface MeetRoomTheme {
	/** Name of the theme */
	name: string;
	/** Indicates if the theme is enabled in the room */
	enabled: boolean;
	/** Base theme mode (light or dark) */
	baseTheme: MeetRoomThemeMode;
	/** Optional custom background color */
	backgroundColor?: string;
	/** Optional custom primary color */
	primaryColor?: string;
	/** Optional custom secondary color */
	secondaryColor?: string;
	/** Optional custom accent color */
	accentColor?: string;
	/** Optional custom surface color */
	surfaceColor?: string;
}

/**
 * Enum representing the base theme mode for a room's appearance.
 */
export enum MeetRoomThemeMode {
	/** Light mode theme */
	LIGHT = 'light',
	/** Dark mode theme */
	DARK = 'dark'
}
