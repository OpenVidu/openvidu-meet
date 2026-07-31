import { MeetRoom, MeetUserDTO, MeetUserRole } from '@openvidu-meet/typings';
import { expect, test } from '@playwright/test';
import { authenticate, createReadyUser, type ReadyUser } from './helpers/auth.helper';
import {
	bulkDelete,
	clearSearchAndExpectAtLeast,
	confirmDialog,
	expectSnackbar,
	failBulkDelete,
	gotoConsolePage,
	gotoRoomDetail,
	listRows,
	loadMoreButton,
	searchAndExpectRows
} from './helpers/console-lists.helper';
import { createRoom, createUser, deleteRooms, deleteUsers } from './helpers/meet-api.helper';

/**
 * E2E coverage for the authenticated console list pages: rooms, users, recordings and the room
 * detail tabs. These pages had no e2e coverage at all, yet they carry the paginated-list behaviour
 * every admin workflow depends on — rendering rows, filtering (which reloads from the backend),
 * token pagination, deletions and back-navigation state.
 *
 * The assertions are on observable behaviour only, never on how the pages hold their state, so this
 * suite is a valid regression gate across refactors of that internal machinery.
 */

/**
 * Unique per-run prefix, so name filters match only this run's entities. Kept short and restricted
 * to `[a-z0-9]` because the API caps `userId` at 20 characters and rejects anything outside
 * lowercase letters, digits and underscores.
 */
const RUN_ID = `z${Date.now().toString(36)}`;

/** Cleanup must never fail a test: entities the test already deleted are expected to be gone. */
const cleanupRooms = async (roomIds: string[]): Promise<void> => {
	await deleteRooms(roomIds).catch(() => {});
};

const cleanupUsers = async (userIds: string[]): Promise<void> => {
	await deleteUsers(userIds).catch(() => {});
};

const makeUser = (suffix: string): Promise<MeetUserDTO> => {
	const userId = `${RUN_ID}_${suffix}`;
	return createUser({ userId, name: userId, role: MeetUserRole.ROOM_MANAGER, password: 'changeme1' });
};

let admin: ReadyUser;

test.beforeAll(async () => {
	({ user: admin } = await createReadyUser(`${RUN_ID}-admin`, MeetUserRole.ADMIN));
});

test.beforeEach(async ({ page }) => {
	await authenticate(page, { userId: admin.userId, password: admin.password });
});

test.afterAll(async () => {
	await cleanupUsers([admin.userId]);
});

// ─── Rooms list ──────────────────────────────────────────────────────────────

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
});

// ─── Users list ──────────────────────────────────────────────────────────────

test.describe('Console Users list E2E Tests', () => {
	let users: MeetUserDTO[];

	test.beforeEach(async () => {
		users = await Promise.all([makeUser('ua'), makeUser('ub')]);
	});

	test.afterEach(async () => {
		await cleanupUsers(users.map((user) => user.userId));
	});

	test('renders the users with one row each', async ({ page }) => {
		await gotoConsolePage(page, 'users', 'ov-users-lists');

		for (const user of users) {
			await expect(page.locator(`[id="select-user-${user.userId}"]`)).toBeVisible();
		}
	});

	test('searching reloads the list narrowed to the match', async ({ page }) => {
		await gotoConsolePage(page, 'users', 'ov-users-lists');
		await expect.poll(async () => listRows(page).count()).toBeGreaterThanOrEqual(2);

		await searchAndExpectRows(page, `${RUN_ID}_ua`, 1);
		await expect(page.locator(`[id="select-user-${users[0].userId}"]`)).toBeVisible();
	});

	test('deleting a user removes its row and keeps the others', async ({ page }) => {
		await gotoConsolePage(page, 'users', 'ov-users-lists');
		await expect(page.locator(`[id="select-user-${users[0].userId}"]`)).toBeVisible({ timeout: 20_000 });

		await page.locator(`[id="delete-user-btn-${users[0].userId}"]`).click();
		await confirmDialog(page);

		await expect(page.locator(`[id="select-user-${users[0].userId}"]`)).toHaveCount(0, { timeout: 20_000 });
		await expect(page.locator(`[id="select-user-${users[1].userId}"]`)).toBeVisible();
	});

	test('the list is still populated after navigating to a user and back', async ({ page }) => {
		await gotoConsolePage(page, 'users', 'ov-users-lists');
		await expect(page.locator(`[id="select-user-${users[0].userId}"]`)).toBeVisible({ timeout: 20_000 });

		await page.locator(`[id="user-name-${users[0].userId}"]`).click();
		await expect(page.locator('ov-users-lists')).toHaveCount(0, { timeout: 20_000 });

		await page.goBack();

		// Back navigation restores the previously loaded page instead of an empty list.
		await expect(page.locator('ov-users-lists')).toBeVisible({ timeout: 20_000 });
		await expect(page.locator(`[id="select-user-${users[0].userId}"]`)).toBeVisible({ timeout: 20_000 });
	});
});

// ─── Recordings list ─────────────────────────────────────────────────────────

test.describe('Console Recordings list E2E Tests', () => {
	test('renders the recordings list rather than an error page', async ({ page }) => {
		await gotoConsolePage(page, 'recordings', 'ov-recording-lists');

		await expect(page.locator('.error-page')).toHaveCount(0);
	});
});

// ─── Room detail: two independent lists on one page ──────────────────────────

test.describe('Console Room detail E2E Tests', () => {
	let room: MeetRoom;

	test.beforeEach(async () => {
		room = await createRoom({ roomName: `${RUN_ID}-detail` });
	});

	test.afterEach(async () => {
		await cleanupRooms([room.roomId]);
	});

	test('renders the recordings tab and the members tab lists independently', async ({ page }) => {
		await gotoRoomDetail(page, room.roomId);

		// The recordings tab is selected first.
		await expect(page.locator('ov-recording-lists')).toBeVisible({ timeout: 20_000 });

		await page.getByRole('tab').filter({ hasText: /member/i }).first().click();

		await expect(page.locator('ov-room-members-list')).toBeVisible({ timeout: 20_000 });
	});
});

// ─── Pagination ──────────────────────────────────────────────────────────────

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

// ─── Bulk-delete failure handling (regression) ───────────────────────────────

test.describe('Console bulk delete failure E2E Tests', () => {
	let users: MeetUserDTO[];

	test.beforeEach(async () => {
		users = await Promise.all([makeUser('fx'), makeUser('fy')]);
	});

	test.afterEach(async () => {
		await cleanupUsers(users.map((user) => user.userId));
	});

	test('notifies the user when the bulk delete fails without a structured response body', async ({ page }) => {
		await gotoConsolePage(page, 'users', 'ov-users-lists');
		await expect(page.locator(`[id="select-user-${users[0].userId}"]`)).toBeVisible({ timeout: 20_000 });

		await failBulkDelete(page, '**/api/v1/users?*');

		await bulkDelete(
			page,
			users.map((user) => user.userId),
			'select-user-'
		);

		// The failure must surface as a notification — never be swallowed by an error thrown while
		// parsing an unstructured response — and the rows must remain.
		await expectSnackbar(page);
		await expect(page.locator(`[id="select-user-${users[0].userId}"]`)).toBeVisible();
	});
});
