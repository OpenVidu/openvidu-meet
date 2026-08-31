import { VideoPresets } from '../services/livekit';
import type { AudioCaptureOptions, VideoCaptureOptions } from '../services/livekit';

/**
 * @internal
 * Capture profile of the local camera, applied by every path that opens or restarts the device
 * (prejoin creation, in-room re-acquisition, device switch and the Room's `videoCaptureDefaults`).
 * A path that omits it captures whatever the browser defaults to, so the published resolution
 * would depend on how the camera happened to be opened.
 *
 * Spread it instead of passing the object: livekit-client writes the active `deviceId` into the
 * options object it is handed.
 */
export const CAMERA_CAPTURE_DEFAULTS: VideoCaptureOptions = {
	resolution: VideoPresets.h720.resolution
};

/**
 * @internal
 * Capture profile of the local microphone. These are livekit-client's own defaults when a track is
 * created, but `restartTrack()` on a device switch replaces the whole constraint set, so they must
 * be stated to survive it.
 */
export const MICROPHONE_CAPTURE_DEFAULTS: AudioCaptureOptions = {
	echoCancellation: true,
	noiseSuppression: true,
	autoGainControl: true,
	voiceIsolation: true
};
