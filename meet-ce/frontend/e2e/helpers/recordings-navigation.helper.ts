import { type Page } from '@playwright/test';
import { performLogin, type LoginOptions } from './auth.helper';

/**
 * Derives the room recordings page URL (`/room/:roomId/recordings`) from a room meeting access URL,
 * preserving any `?secret=` so the recordings page resolves the same role/permissions.
 */
export const toRoomRecordingsUrl = (meetingUrl: string): string => {
	const url = new URL(meetingUrl);
	url.pathname = url.pathname.replace(/\/room\/([^/]+)\/?$/, '/room/$1/recordings');
	return url.toString();
};

/**
 * Navigates to a room recordings page URL, logging the user in first when the app presents the
 * login form (auto-detected). The caller asserts the resulting page state (recording list, delete
 * availability, …). Note: the recordings list does not redirect to login on its own, so an
 * authenticated user must already have an established session before navigating here.
 */
export const openRoomRecordings = async (
	page: Page,
	recordingsUrl: string,
	options?: { login?: LoginOptions }
): Promise<void> => {
	await page.goto(recordingsUrl, { waitUntil: 'domcontentloaded' });

	if (options?.login) {
		await performLogin(page, options.login);
	}
};

/**
 * Navigates to an individual recording URL (e.g. a shared recording link), logging the user in
 * first when the app presents the login form (auto-detected — a private shared link redirects to
 * login for anonymous visitors). The caller asserts the resulting page state.
 */
export const openRecording = async (
	page: Page,
	recordingUrl: string,
	options?: { login?: LoginOptions }
): Promise<void> => {
	await page.goto(recordingUrl, { waitUntil: 'domcontentloaded' });

	if (options?.login) {
		await performLogin(page, options.login);
	}
};
