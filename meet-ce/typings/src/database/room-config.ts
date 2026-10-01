import { MeetRecordingEncodingOptions, MeetRecordingEncodingPreset, MeetRecordingLayout } from './recording.entity.js';
import { MeetRoomMemberRole } from './room-member.entity.js';

/**
 * Interface representing the config for a room.
 */
export interface MeetRoomConfig {
	/**
	 * Maximum number of participants that may be in the meeting at the same time.
	 * Once reached, further join attempts are rejected.
	 * `null` (or an absent key) means the number of participants is unlimited; the highest limit
	 * that can be set is `30`.
	 */
	maxParticipants?: number | null;
	/**
	 * Maximum duration of the meeting in minutes. When reached, the meeting ends for every
	 * participant, exactly as if a moderator had ended it.
	 * `null` (or an absent key) means the meeting duration is unlimited; the lowest limit that can
	 * be set is `1`, the highest is `1440` (1 day).
	 */
	maxDurationMinutes?: number | null;
	/**
	 * Room-wide **default** for whether participants join with their microphone active. This is the
	 * initial state, not a capability: the participant may reactivate the device afterwards, and a
	 * denying `mediaPublishAudio` permission always wins.
	 *
	 * It is a default, not a policy: the embedding application's `initial-audio-active` attribute
	 * takes precedence whenever it is set (to either value). To *enforce* silence, deny the
	 * permission instead. `true` when absent.
	 */
	initialAudioActive?: boolean;
	/**
	 * Room-wide **default** for whether participants join with their camera active. This is the
	 * initial state, not a capability: the participant may reactivate the device afterwards, and a
	 * denying `mediaPublishVideo` permission always wins.
	 *
	 * It is a default, not a policy: the embedding application's `initial-video-active` attribute
	 * takes precedence whenever it is set (to either value). To *enforce* a camera-off meeting, deny
	 * the permission instead. `true` when absent.
	 */
	initialVideoActive?: boolean;
	/**
	 * Configuration for chat feature. See {@link MeetChatConfig} for details.
	 */
	chat: MeetChatConfig;
	/**
	 * Configuration for recording feature. See {@link MeetRecordingConfig} for details.
	 */
	recording: MeetRecordingConfig;
	/**
	 * Configuration for live broadcast feature. See {@link MeetBroadcastConfig} for details.
	 */
	broadcast: MeetBroadcastConfig;
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
	/**
	 * Configuration for the raise hand feature. See {@link MeetRaiseHandConfig} for details.
	 */
	raiseHand: MeetRaiseHandConfig;
	/**
	 * Configuration for the reactions feature. See {@link MeetReactionsConfig} for details.
	 */
	reactions: MeetReactionsConfig;
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
	 * reached (see {@link MeetRecordingAutoStartMode} for the available thresholds). The threshold is
	 * re-evaluated on every join and on every promotion to moderator. The start is attributed to the
	 * system: no participant holding the `recordingControl` permission is involved. Ignored while
	 * end-to-end encryption is enabled, which already excludes recording.
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
	/** Starts as soon as a participant with the moderator role is in the meeting, by join or promotion. */
	WHEN_MODERATOR_JOINS = 'when_moderator_joins'
}

/**
 * The trigger condition for a {@link MeetRecordingAutoStartMode}, expressed as data rather than a
 * verdict: how many participants of which room roles the meeting must already hold. Evaluating it
 * against the live meeting state is the caller's job.
 */
export interface MeetRecordingAutoStartPreset {
	/** Minimum number of matching participants that must be present for this mode to trigger. */
	minParticipants: number;
	/**
	 * Room roles whose participants count toward `minParticipants`. `when_first_participant_joins`
	 * and `when_second_participant_joins` list every {@link MeetRoomMemberRole}, so they count any
	 * standard participant. A mode gated on one specific role (like `when_moderator_joins`) lists
	 * just that role instead of adding a separate counting mechanism.
	 */
	participantRoles: MeetRoomMemberRole[];
}

/**
 * The trigger condition for every {@link MeetRecordingAutoStartMode}. The single source of truth
 * for both the backend (which evaluates it against the live meeting to decide whether to start
 * recording) and the frontend (which uses it to warn when a room's `maxParticipants` can never
 * reach the threshold), so the two can't drift apart.
 */
export const MEET_RECORDING_AUTO_START_PRESETS: Record<MeetRecordingAutoStartMode, MeetRecordingAutoStartPreset> = {
	[MeetRecordingAutoStartMode.WHEN_FIRST_PARTICIPANT_JOINS]: {
		minParticipants: 1,
		participantRoles: Object.values(MeetRoomMemberRole)
	},
	[MeetRecordingAutoStartMode.WHEN_SECOND_PARTICIPANT_JOINS]: {
		minParticipants: 2,
		participantRoles: Object.values(MeetRoomMemberRole)
	},
	[MeetRecordingAutoStartMode.WHEN_MODERATOR_JOINS]: {
		minParticipants: 1,
		participantRoles: [MeetRoomMemberRole.MODERATOR]
	}
};

/**
 * The minimum number of matching participants required for a {@link MeetRecordingAutoStartMode} to
 * ever trigger.
 */
export const minParticipantsForAutoStart = (mode: MeetRecordingAutoStartMode): number =>
	MEET_RECORDING_AUTO_START_PRESETS[mode].minParticipants;

/**
 * Interface representing the config for live broadcasts (RTMP streaming) in a room.
 */
export interface MeetBroadcastConfig {
	/**
	 * Indicates if live broadcast is enabled in the room. Forced to `false` while end-to-end
	 * encryption is enabled, which excludes broadcast the same way it excludes recording.
	 */
	enabled: boolean;
	/**
	 * The room's default destinations: where a meeting streams when it goes live. At most
	 * {@link MEET_BROADCAST_MAX_DESTINATIONS}, and at least one while `enabled` is `true`. In the
	 * meeting, a participant with the `broadcastControl` permission streams to all of them or to a
	 * subset, and with `broadcastAddDestinations` adds destinations for that meeting only: the list
	 * saved here never changes from inside a meeting.
	 * See {@link MeetBroadcastDestination} for details.
	 */
	destinations: MeetBroadcastDestination[];
	/**
	 * Layout of the meeting as it is streamed, the same layouts a recording uses. See
	 * {@link MeetRecordingLayout} for details. Defaults to `grid`; config updates deep-merge with the
	 * stored config, so omitting this field keeps its current value.
	 */
	layout?: MeetRecordingLayout;
	/**
	 * Encoding of the stream, the same presets and options a recording uses: a preset for common
	 * scenarios, or detailed options for fine-grained control. Defaults to `H264_720P_30`; config
	 * updates deep-merge with the stored config, so omitting this field keeps its current value.
	 */
	encoding?: MeetRecordingEncodingPreset | MeetRecordingEncodingOptions;
}

/**
 * A destination saved in a room's config: a name and the RTMP(S) URL the platform issued, stream
 * key included.
 */
export interface MeetBroadcastDestination {
	/**
	 * Identifier assigned by the server when the destination is saved. Always present when served,
	 * omitted when adding a destination. On an update, a destination sent with its `id` is the saved
	 * one (and keeps its saved URL, see `url`), while one sent without `id` is new.
	 */
	id?: string;
	/** Display name of the destination, such as the channel or platform it streams to */
	name: string;
	/**
	 * Full `rtmp://` or `rtmps://` URL to stream to, stream key included. The stream key is a
	 * secret, so it is never served: responses carry the URL with its last path segment replaced by
	 * {@link MEET_BROADCAST_REDACTED_STREAM_KEY} and without query string. An update that sends a
	 * destination with its `id` and that redacted URL exactly as served (a response echoed back)
	 * keeps the saved URL; a full URL replaces it, and a redacted URL with any other change is
	 * rejected, since there is no stream key to go with it.
	 */
	url: string;
}

/**
 * Maximum number of destinations a room's config, and a broadcast, may hold.
 */
export const MEET_BROADCAST_MAX_DESTINATIONS = 5;

/**
 * Placeholder that replaces the stream key (the last path segment) of a destination URL when it is
 * served. See {@link MeetBroadcastDestination.url}.
 */
export const MEET_BROADCAST_REDACTED_STREAM_KEY = '********';

/**
 * Maximum length of a broadcast destination's name.
 */
export const MEET_BROADCAST_DESTINATION_NAME_MAX_LENGTH = 50;

const STREAM_URL_FORMAT = /^rtmps?:\/\/.*\/.*\/[^\s/]+( live=1)?$/;

/**
 * Whether a destination URL has the form the media server streams to,
 * `rtmp(s)://{host}(/{path})/{app}/{stream_key}`, optionally followed by ` live=1`. The stream key
 * is what follows the last `/`, so a URL ending in `/` has none.
 */
export const isValidStreamUrl = (url: string): boolean => STREAM_URL_FORMAT.test(url);

/**
 * A destination URL as the API serves it: its stream key (the last non-empty path segment, a
 * trailing slash notwithstanding) replaced by {@link MEET_BROADCAST_REDACTED_STREAM_KEY}, and its
 * query string dropped.
 */
export const redactStreamUrl = (url: string): string => {
	const { protocol, host, pathname } = new URL(url);
	const segments = (pathname || '/').split('/');
	segments[streamKeyIndex(segments)] = MEET_BROADCAST_REDACTED_STREAM_KEY;
	return `${protocol}//${host}${segments.join('/')}`;
};

/**
 * Whether a destination URL is one the API served, with its stream key replaced by
 * {@link MEET_BROADCAST_REDACTED_STREAM_KEY}, rather than a full URL.
 */
export const isRedactedStreamUrl = (url: string): boolean => {
	const segments = url.split(/[?#]/)[0].split('/');
	return segments[streamKeyIndex(segments)] === MEET_BROADCAST_REDACTED_STREAM_KEY;
};

const streamKeyIndex = (segments: string[]): number => {
	for (let index = segments.length - 1; index > 0; index--) {
		if (segments[index] !== '') return index;
	}

	return segments.length - 1;
};

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
 * Interface representing the config for the raise hand feature in a room.
 */
export interface MeetRaiseHandConfig {
	/**
	 * Indicates if participants can raise their hand in the room. The server rejects a raise while
	 * it is `false`.
	 */
	enabled: boolean;
}

/**
 * Interface representing the config for the reactions feature in a room.
 */
export interface MeetReactionsConfig {
	/**
	 * Indicates if participants can send reactions in the room. The server rejects a reaction while
	 * it is `false`.
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
