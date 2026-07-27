/**
 * The single storage prefix for the whole application.
 *
 * Every key persisted through `BrowserStorageService` is namespaced under this prefix, regardless of
 * which store (media, meet, token, session) owns it. Because there is exactly one prefix, the raw
 * key strings must be globally unique across every key enum — an invariant enforced by
 * `storage-keys.spec.ts`.
 */
export const STORAGE_PREFIX = 'ovMeet-';

/**
 * Keys owned by {@link MeetStorageService} (shell-level preferences shared across the app).
 *
 * `lang` and `theme` are the single persisted home for the user's language and theme preferences:
 * both the shell and the meeting read/write them through this one store. `lastParticipantName` is the
 * cross-visit remembered display name — distinct from the tab-scoped `participantName` media key.
 */
export enum MeetStorageKeys {
	LAYOUT_MODE = 'layoutMode',
	MAX_VISIBLE_REMOTE_PARTICIPANTS = 'maxVisibleRemoteParticipants',
	LANG = 'lang',
	THEME = 'theme',
	LAST_PARTICIPANT_NAME = 'lastParticipantName'
}

/**
 * Keys owned by {@link TokenStorageService} (authentication tokens, localStorage).
 *
 * The final key strings are unchanged from before the storage refactor so the in-place migration
 * (`browser-storage.migration.ts`) can wrap the existing raw values without a rename.
 */
export enum TokenStorageKeys {
	ACCESS_TOKEN = 'accessToken',
	REFRESH_TOKEN = 'refreshToken'
}

/**
 * Keys owned by {@link SessionStorageService} (meeting-scoped state, sessionStorage).
 *
 * The final key strings are unchanged from before the storage refactor so the in-place migration
 * (`browser-storage.migration.ts`) can rewrap the existing plain-JSON values without a rename.
 */
export enum SessionStorageKeys {
	ROOM_SECRET = 'roomSecret',
	REDIRECT_URL = 'redirectUrl',
	E2EE_DATA = 'e2eeData',
	MUST_CHANGE_PASSWORD = 'mustChangePassword'
}
