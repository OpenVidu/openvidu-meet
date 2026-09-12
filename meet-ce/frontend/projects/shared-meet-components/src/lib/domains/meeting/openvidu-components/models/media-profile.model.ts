import { VideoPresets } from '../services/livekit';
import type { RoomOptions, ScreenShareCaptureOptions } from '../services/livekit';

type RoomMediaOptions = Required<
	Pick<
		RoomOptions,
		'adaptiveStream' | 'dynacast' | 'videoCaptureDefaults' | 'audioCaptureDefaults' | 'publishDefaults'
	>
>;

/**
 * @internal
 * Every media-quality decision Meet makes: what the camera and microphone capture, how the tracks
 * are published (codec, simulcast, bitrates), how remote video is subscribed and what a screen share
 * captures. `room` is a subset of livekit-client's `RoomOptions`, so each value reads exactly as the
 * SDK documents it and the SDK fills in whatever is left unset.
 */
export interface MediaProfile {
	room: RoomMediaOptions;
	screenShareCapture: ScreenShareCaptureOptions;
}

/**
 * @internal
 * A partial {@link MediaProfile} merged one key deep over {@link DEFAULT_MEDIA_PROFILE}, so
 * `{"room":{"publishDefaults":{"videoCodec":"vp9"}}}` changes the codec and nothing else.
 */
export interface MediaProfileOverride {
	room?: Partial<RoomMediaOptions>;
	screenShareCapture?: Partial<ScreenShareCaptureOptions>;
}

/**
 * @internal
 * Browser-storage key of the {@link MediaProfileOverride} in force, stored through
 * `BrowserStorageService` (so `localStorage["ovMeet-mediaProfile"]` holds `{"item": <override>}`).
 * It lets other media settings be measured on a real deployment from the browser alone, and affects
 * only the browser that stores it.
 */
export const MEDIA_PROFILE_OVERRIDE_KEY = 'mediaProfile';

export const DEFAULT_MEDIA_PROFILE: MediaProfile = {
	room: {
		adaptiveStream: true,
		dynacast: true,
		videoCaptureDefaults: { resolution: VideoPresets.h720.resolution },
		// livekit-client's own defaults when a track is created, but `restartTrack()` on a device
		// switch replaces the whole constraint set, so they must be stated to survive it.
		audioCaptureDefaults: {
			echoCancellation: true,
			noiseSuppression: true,
			autoGainControl: true,
			voiceIsolation: true
		},
		publishDefaults: {
			// MicActivityService monitors a clone of the capture track to power the "speaking while
			// muted" warning, so the device (and the OS recording indicator) stays open while muted
			// anyway. Stopping the SDK's track would only add a full getUserMedia on every unmute (latency,
			// a Bluetooth profile switch and a fresh MediaStreamTrack that re-clones the monitor) for no
			// privacy gain.
			stopMicTrackOnMute: false
		}
	},
	screenShareCapture: {
		audio: true,
		video: { displaySurface: 'browser' },
		systemAudio: 'include',
		resolution: VideoPresets.h1080.resolution,
		contentHint: 'text',
		suppressLocalAudioPlayback: true,
		selfBrowserSurface: 'exclude',
		surfaceSwitching: 'include',
		preferCurrentTab: false
	}
};
