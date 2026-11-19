import { MeetRoom } from '@openvidu-meet/typings';
import { expect, test } from '@playwright/test';
import {
	bulkDelete,
	cleanupRooms,
	clearSearchAndExpectAtLeast,
	confirmDialog,
	figure,
	figureCount,
	gotoConsolePage,
	listRows,
	loadMoreButton,
	newRunId,
	searchAndExpectRows,
	signInAdminBeforeEach
} from '../helpers/console.helper';
import { closeRoom, createRoom } from '../helpers/meet-api.helper';

const RUN_ID = newRunId();

signInAdminBeforeEach();

test.describe('Console Rooms list E2E Tests', () => {
	let rooms: MeetRoom[];

	test.beforeEach(async () => {
		rooms = await Promise.all(
			['a', 'b', 'c'].map((suffix) => createRoom({ roomName: `${RUN_ID}-room-${suffix}` }))
		);
	});

	test.afterEach(async () => {
		await cleanupRooms(rooms.map((room) => room.roomId));
	});

	test('renders the rooms with one row each', async ({ page }) => {
		await gotoConsolePage(page, 'rooms', 'ov-rooms-lists');

		for (const room of rooms) {
			await expect(page.locator(`[id="select-room-${room.roomId}"]`)).toBeVisible();
		}
	});

	test('searching reloads the list narrowed to the match, and clearing restores it', async ({ page }) => {
		await gotoConsolePage(page, 'rooms', 'ov-rooms-lists');
		await expect.poll(async () => listRows(page).count()).toBeGreaterThanOrEqual(3);

		// The prefix is unique to this run, so exactly one room can match.
		await searchAndExpectRows(page, `${RUN_ID}-room-a`, 1);
		await expect(page.locator(`[id="select-room-${rooms[0].roomId}"]`)).toBeVisible();

		await clearSearchAndExpectAtLeast(page, 3);
	});

	test('clicking a room navigates to its detail page', async ({ page }) => {
		await gotoConsolePage(page, 'rooms', 'ov-rooms-lists');

		await page.locator(`[id="room-name-cell-${rooms[0].roomId}"]`).click();

		await expect(page.locator('ov-room-detail')).toBeVisible({ timeout: 20_000 });
		expect(page.url()).toContain(rooms[0].roomId);
	});

	test('deleting a room removes its row and keeps the others', async ({ page }) => {
		await gotoConsolePage(page, 'rooms', 'ov-rooms-lists');
		await expect(page.locator(`[id="select-room-${rooms[0].roomId}"]`)).toBeVisible({ timeout: 20_000 });

		// On rooms, delete lives inside the per-row "more actions" menu.
		await page.locator(`[id="more-actions-btn-${rooms[0].roomId}"]`).click();
		await page.locator(`[id="delete-room-btn-${rooms[0].roomId}"]`).click();
		await confirmDialog(page);

		await expect(page.locator(`[id="select-room-${rooms[0].roomId}"]`)).toHaveCount(0, { timeout: 20_000 });
		await expect(page.locator(`[id="select-room-${rooms[1].roomId}"]`)).toBeVisible();
	});

	test('bulk deleting the selected rooms removes exactly those rows', async ({ page }) => {
		await gotoConsolePage(page, 'rooms', 'ov-rooms-lists');
		await expect(page.locator(`[id="select-room-${rooms[2].roomId}"]`)).toBeVisible({ timeout: 20_000 });

		await bulkDelete(page, [rooms[0].roomId, rooms[1].roomId], 'select-room-');

		await expect(page.locator(`[id="select-room-${rooms[0].roomId}"]`)).toHaveCount(0, { timeout: 20_000 });
		await expect(page.locator(`[id="select-room-${rooms[1].roomId}"]`)).toHaveCount(0);
		await expect(page.locator(`[id="select-room-${rooms[2].roomId}"]`)).toBeVisible();
	});

	test('selecting a figure filters the list and selecting it again clears the filter', async ({ page }) => {
		await closeRoom(rooms[0].roomId);
		await gotoConsolePage(page, 'rooms', 'ov-rooms-lists');

		await figure(page, 'closed').click();

		await expect(figure(page, 'closed')).toHaveAttribute('aria-pressed', 'true');
		await expect(page).toHaveURL(/status=closed/);
		await expect(page.locator(`[id="select-room-${rooms[0].roomId}"]`)).toBeVisible({ timeout: 20_000 });
		await expect(page.locator(`[id="select-room-${rooms[1].roomId}"]`)).toHaveCount(0);
		await expect(page.locator('ov-rooms-lists .ov-active-filters .filter-chip')).toContainText('Closed');
		await page.locator('ov-rooms-lists .ov-filters-trigger').click();
		await expect(page.locator('#status-filter-select')).toContainText('Closed');

		await figure(page, 'closed').click();

		await expect(figure(page, 'all')).toHaveAttribute('aria-pressed', 'true');
		await expect(page).not.toHaveURL(/status=/);
		await expect(page.locator(`[id="select-room-${rooms[1].roomId}"]`)).toBeVisible({ timeout: 20_000 });
	});

	test('searching leaves the figures as they are and deleting a room updates them', async ({ page }) => {
		await gotoConsolePage(page, 'rooms', 'ov-rooms-lists');
		await expect(figureCount(page, 'all')).toBeVisible();
		const total = Number(await figureCount(page, 'all').innerText());

		await searchAndExpectRows(page, `${RUN_ID}-room-a`, 1);
		await expect(figureCount(page, 'all')).toHaveText(String(total));

		await page.locator(`[id="more-actions-btn-${rooms[0].roomId}"]`).click();
		await page.locator(`[id="delete-room-btn-${rooms[0].roomId}"]`).click();
		await confirmDialog(page);

		await expect(figureCount(page, 'all')).toHaveText(String(total - 1), { timeout: 20_000 });
	});

	test('filtering by status in the filter panel selects the matching figure', async ({ page }) => {
		await gotoConsolePage(page, 'rooms', 'ov-rooms-lists');
		await expect(figure(page, 'all')).toHaveAttribute('aria-pressed', 'true');

		await page.locator('ov-rooms-lists .ov-filters-trigger').click();
		await page.locator('#status-filter-select').click();
		await page.locator('#status-option-closed').click();

		await expect(figure(page, 'closed')).toHaveAttribute('aria-pressed', 'true');
		await expect(figure(page, 'all')).toHaveAttribute('aria-pressed', 'false');
	});
});

test.describe('Console list pagination E2E Tests', () => {
	// A page holds 50 items, so 51 rooms guarantee a second page.
	let rooms: MeetRoom[];

	test.beforeAll(async () => {
		rooms = [];

		// Created in batches to keep the per-IP request burst modest.
		for (let batch = 0; batch < 6; batch++) {
			const created = await Promise.all(
				Array.from({ length: batch === 5 ? 6 : 9 }, (_, index) =>
					createRoom({ roomName: `${RUN_ID}-page-${batch}-${index}` })
				)
			);
			rooms.push(...created);
		}
	});

	test.afterAll(async () => {
		await cleanupRooms(rooms.map((room) => room.roomId));
	});

	test('loads the next page on demand, keeping the rows already loaded', async ({ page }) => {
		await gotoConsolePage(page, 'rooms', 'ov-rooms-lists');
		const rows = listRows(page);

		// The first page is capped, so a "load more" control must be offered.
		await expect(loadMoreButton(page)).toBeVisible({ timeout: 30_000 });
		const firstPageRows = await rows.count();

		await loadMoreButton(page).click();

		// The second page is appended to the first, never replaces it.
		await expect.poll(async () => rows.count(), { timeout: 30_000 }).toBeGreaterThan(firstPageRows);
	});
});
