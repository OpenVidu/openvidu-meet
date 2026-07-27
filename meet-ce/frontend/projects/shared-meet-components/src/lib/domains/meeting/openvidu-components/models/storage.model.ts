/**
 * @internal
 *
 * Keys owned by {@link MediaStorageService} (per-participant meeting media preferences).
 *
 * Language and theme are NOT here: they are shell-level preferences persisted by
 * `MeetStorageService` (a single persisted owner per preference).
 */
export enum MediaStorageKeys {
	PARTICIPANT_NAME = 'participantName',
	VIDEO_DEVICE = 'videoDevice',
	AUDIO_DEVICE = 'audioDevice',
	MICROPHONE_ENABLED = 'microphoneEnabled',
	CAMERA_ENABLED = 'cameraEnabled',
	BACKGROUND = 'virtualBg'
}

/**
 * @internal
 *
 * Keys whose value is scoped to a single browser tab.
 *
 * They are persisted in `sessionStorage`, which is isolated per tab and cleared automatically
 * by the browser when the tab is closed. This lets several tabs join with independent settings
 * (name, camera/microphone state) without leaking state between them. Every other key is stored
 * in `localStorage` and therefore shared across all tabs of the same origin.
 */
export const TAB_SPECIFIC_KEYS: ReadonlySet<MediaStorageKeys> = new Set([
	MediaStorageKeys.PARTICIPANT_NAME,
	MediaStorageKeys.MICROPHONE_ENABLED,
	MediaStorageKeys.CAMERA_ENABLED
]);
