import { MeetRoom, MeetRoomStatus, MeetUserRole } from '@openvidu-meet/typings';
import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { authenticate, createReadyUser, openSignedInPage, type ReadyUser } from './auth.helper';
import {
	deleteRooms,
	deleteUsers,
	endMeeting,
	getRoomStatus,
	MEET_BASE_URL,
	waitForNoActiveMeeting
} from './meet-api.helper';
import { openMeeting } from './meeting-navigation.helper';

/**
 * Helpers for the console pages. They assert only on observable behaviour (rendered rows, the
 * search/refresh round-trip, pagination, deletions and notifications), so the console suite is a
 * valid gate across refactors of the pages' internal state handling.
 */

/**
 * A prefix unique to one run of a spec file, so name filters match only its own entities. Short and
 * within `[a-z0-9]`, because a `userId` holds at most 20 lowercase letters, digits and underscores.
 */
export const newRunId = (): string => `z${Date.now().toString(36)}`;

/** Cleanup never fails a test: the entities a test already deleted are expected to be gone. */
export const cleanupRooms = async (roomIds: string[]): Promise<void> => {
	await deleteRooms(roomIds).catch(() => {});
};

export const cleanupUsers = async (userIds: string[]): Promise<void> => {
	await deleteUsers(userIds).catch(() => {});
};

/**
 * Signs a fresh admin into the console before each test of the calling spec file and deletes it
 * after the file. Returns a getter, since the admin exists only once `beforeAll` has run.
 */
export const signInAdminBeforeEach = (): (() => ReadyUser) => {
	let admin: ReadyUser;

	test.beforeAll(async () => {
		({ user: admin } = await createReadyUser('Console admin', MeetUserRole.ADMIN));
	});

	test.beforeEach(async ({ page }) => {
		await authenticate(page, admin);
	});

	test.afterAll(async () => {
		await cleanupUsers([admin.userId]);
	});

	return () => admin;
};

const SEARCH_INPUT = '#search-input';
const LOAD_MORE_BUTTON = '#load-more-btn';
const BULK_DELETE_BUTTON = '#bulk-delete-btn';
const CONFIRM_DIALOG_BUTTON = '.confirm-button';
/** A notification raised by `NotificationService.showMessage`, which auto-dismisses after 4s. */
const MESSAGE_NOTIFICATION = '.ov-notification[data-kind="message"]';

/**
 * One row per listed entity. Keyed on the selection *cell*, which every row renders exactly once —
 * unlike `[id^="select-room-"]`, which also matches the `<input>` Angular Material generates inside
 * the checkbox and therefore counts every row twice.
 */
export const listRows = (page: Page): Locator => page.locator('[id^="select-cell-"]');

/**
 * Navigates to a console page and waits for its list component to render, which only happens once
 * the page has finished initializing (the loader is gone).
 */
export const gotoConsolePage = async (
	page: Page,
	path: 'rooms' | 'users' | 'recordings',
	listSelector: string
): Promise<void> => {
	await page.goto(`${MEET_BASE_URL}/${path}`, { waitUntil: 'domcontentloaded' });
	await expect(page.locator(listSelector)).toBeVisible({ timeout: 20_000 });
};

/** Navigates to a room's detail page and waits for the page to render. */
export const gotoRoomDetail = async (page: Page, roomId: string): Promise<void> => {
	await page.goto(`${MEET_BASE_URL}/rooms/${roomId}`, { waitUntil: 'domcontentloaded' });
	await expect(page.locator('ov-room-detail')).toBeVisible({ timeout: 20_000 });
};

/**
 * Runs a name search and waits for the resulting reload to settle. The search box applies on Enter
 * (or via the search button) rather than on every keystroke, and filtering reloads the list from the
 * backend instead of filtering the rendered rows.
 */
export const searchAndExpectRows = async (page: Page, term: string, expected: number): Promise<void> => {
	await page.locator(SEARCH_INPUT).fill(term);
	await page.locator(SEARCH_INPUT).press('Enter');
	await expect(listRows(page)).toHaveCount(expected, { timeout: 20_000 });
};

/** Clears the search and waits for the list to reload with at least `atLeast` rows. */
export const clearSearchAndExpectAtLeast = async (page: Page, atLeast: number): Promise<void> => {
	await page.locator(SEARCH_INPUT).fill('');
	await page.locator(SEARCH_INPUT).press('Enter');
	await expect.poll(async () => listRows(page).count(), { timeout: 20_000 }).toBeGreaterThanOrEqual(atLeast);
};

/** Confirms the currently open confirmation dialog (delete / bulk delete). */
export const confirmDialog = async (page: Page): Promise<void> => {
	const confirmButton = page.locator(CONFIRM_DIALOG_BUTTON);
	await expect(confirmButton).toBeVisible({ timeout: 10_000 });
	await confirmButton.click();
};

/** Asserts a notification is shown. Kept text-agnostic: the message is localized. */
export const expectNotification = async (page: Page): Promise<void> => {
	await expect(page.locator(MESSAGE_NOTIFICATION).first()).toBeVisible({ timeout: 10_000 });
};

/** Selects the given rows by clicking their per-row checkbox, then confirms the bulk delete. */
export const bulkDelete = async (page: Page, rowIds: string[], idPrefix: string): Promise<void> => {
	for (const id of rowIds) {
		await page.locator(`[id="${idPrefix}${id}"]`).click();
	}

	const bulkDeleteButton = page.locator(BULK_DELETE_BUTTON);
	await expect(bulkDeleteButton).toBeVisible({ timeout: 10_000 });
	await bulkDeleteButton.click();
	await confirmDialog(page);
};

/** The "load more" control, present only when the backend reported further pages. */
export const loadMoreButton = (page: Page): Locator => page.locator(LOAD_MORE_BUTTON);

/**
 * Makes bulk-delete requests fail like an unstructured server/network error: a status with no
 * `{ deleted, failed }` body. Reading those fields unguarded used to throw inside the error handler
 * and swallow the user-facing message, so the pages must still notify.
 */
export const failBulkDelete = async (page: Page, urlPattern: string): Promise<void> => {
	await page.route(urlPattern, async (route) => {
		if (route.request().method() !== 'DELETE') {
			await route.fallback();
			return;
		}

		await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
	});
};

/** A key figure (tile on wide screens, chip on a phone) of a console list page. */
export const figure = (page: Page, key: string): Locator => page.locator(`ov-list-figures [data-figure="${key}"]`);

/** The number a figure's tile shows. */
export const figureCount = (page: Page, key: string): Locator => figure(page, key).locator('.tile-count');

/** Opens the filter panel of the recordings list on the page and chooses `labels` in its multiple status select. */
export const chooseRecordingStatuses = async (page: Page, labels: string[]): Promise<void> => {
	const list = page.locator('ov-recording-lists');
	await list.locator('.ov-filters-trigger').click();
	await list.locator('mat-select').click();

	for (const label of labels) {
		await page.getByRole('option', { name: label, exact: true }).click();
	}

	await page.keyboard.press('Escape');
};

/** Runs `body` on a page of its own browser context signed in as `user`, next to the admin's page of the test. */
export const asUser = async (browser: Browser, user: ReadyUser, body: (page: Page) => Promise<void>): Promise<void> => {
	const page = await openSignedInPage(browser, user);

	try {
		await body(page);
	} finally {
		await page.context().close();
	}
};

/**
 * Starts a meeting in the room: a guest joins through its speaker link, and the room is `active_meeting`
 * once LiveKit reports the meeting. `end` ends the meeting and waits until it is gone, so the room can be
 * changed or deleted again; it tolerates a room the test already deleted.
 */
export const startMeeting = async (browser: Browser, room: MeetRoom): Promise<{ end: () => Promise<void> }> => {
	const page = await browser.newPage();

	const end = async () => {
		await endMeeting(room.roomId).catch(() => {});
		await waitForNoActiveMeeting(room.roomId).catch(() => {});
		await page.context().close();
	};

	try {
		await openMeeting(page, room.access.anonymous.speaker.url, { name: 'Guest' });
		await expect.poll(() => getRoomStatus(room.roomId), { timeout: 20_000 }).toBe(MeetRoomStatus.ACTIVE_MEETING);
	} catch (error) {
		await end();
		throw error;
	}

	return { end };
};
