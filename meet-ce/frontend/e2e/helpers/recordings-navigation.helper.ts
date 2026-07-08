import { type Page } from '@playwright/test';
import { performLogin, type LoginOptions } from './auth.helper';

/**
 * Derives the room recordings URL from a room access URL by adding the
 * `show-only-recordings=true` query param. The room route resolves the same access (preserving any
 * `?secret=`) and then redirects to the recordings list, so recordings inherit the room's access
 * method and permissions.
 */
export const toRoomRecordingsUrl = (meetingUrl: string): string => {
	const url = new URL(meetingUrl);
	url.searchParams.set('show-only-recordings', 'true');
	return url.toString();
};

/**
 * Derives an individual recording URL from a room access URL by adding the
 * `show-recording=<recordingId>` query param. The room route resolves the same access (preserving
 * any `?secret=`) and then redirects to the individual recording view, so the recording inherits the
 * room's access method and permissions.
 */
export const toIndividualRecordingUrl = (meetingUrl: string, recordingId: string): string => {
	const url = new URL(meetingUrl);
	url.searchParams.set('show-recording', recordingId);
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
