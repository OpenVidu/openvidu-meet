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
	BACKGROUND = 'virtualBg'
}

/**
 * @internal
 *
 * Keys whose value is scoped to a single browser tab.
 *
 * They are persisted in `sessionStorage`, which is isolated per tab and cleared automatically
 * by the browser when the tab is closed. This lets several tabs join with independent names without
 * leaking state between them. Every other key is stored in `localStorage` and therefore shared
 * across all tabs of the same origin.
 *
 * The camera/microphone enabled state is deliberately NOT here, nor anywhere else in storage: it is
 * per-entry intent held in memory by `LocalMediaIntentService`.
 */
export const TAB_SPECIFIC_KEYS: ReadonlySet<MediaStorageKeys> = new Set([MediaStorageKeys.PARTICIPANT_NAME]);
