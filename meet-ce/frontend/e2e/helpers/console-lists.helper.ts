import { expect, type Locator, type Page } from '@playwright/test';
import { MEET_BASE_URL } from './meet-api.helper';

/**
 * Helpers for the authenticated console list pages (rooms, users, recordings and the room detail
 * tabs). They deliberately assert only on observable behaviour — rendered rows, the search/refresh
 * round-trip, pagination, deletions and notifications — so the same suite is a valid gate before and
 * after refactors of the pages' internal state handling.
 */

const SEARCH_INPUT = '#search-input';
const LOAD_MORE_BUTTON = '#load-more-btn';
const BULK_DELETE_BUTTON = '#bulk-delete-btn';
const CONFIRM_DIALOG_BUTTON = '.confirm-button';
/** `panelClass` set by NotificationService.showSnackbar. Snackbars auto-dismiss after 3s. */
const SNACKBAR = '.custom-snackbar';

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
export const expectSnackbar = async (page: Page): Promise<void> => {
	await expect(page.locator(SNACKBAR).first()).toBeVisible({ timeout: 10_000 });
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
