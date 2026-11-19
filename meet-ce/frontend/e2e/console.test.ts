import { MeetRoom, MeetRoomMemberRole, MeetUserDTO, MeetUserRole } from '@openvidu-meet/typings';
import { expect, test } from '@playwright/test';
import { authenticate, createReadyUser, expectNoLoginPage, type ReadyUser } from './helpers/auth.helper';
import {
	bulkDelete,
	chooseRecordingStatuses,
	clearSearchAndExpectAtLeast,
	confirmDialog,
	expectNotification,
	failBulkDelete,
	figure,
	figureCount,
	gotoConsolePage,
	gotoRoomDetail,
	listRows,
	loadMoreButton,
	searchAndExpectRows
} from './helpers/console-lists.helper';
import {
	closeRoom,
	createRoom,
	createRoomMember,
	createUser,
	deleteRooms,
	deleteUsers,
	MEET_BASE_URL
} from './helpers/meet-api.helper';

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

	test('selecting a role figure lists only the users with that role', async ({ page }) => {
		await gotoConsolePage(page, 'users', 'ov-users-lists');
		await expect(page.locator(`[id="select-user-${users[0].userId}"]`)).toBeVisible({ timeout: 20_000 });

		await figure(page, 'roomManagers').click();

		await expect(figure(page, 'roomManagers')).toHaveAttribute('aria-pressed', 'true');
		await expect(page).toHaveURL(/role=room_manager/);
		await expect(page.locator(`[id="user-name-cell-${admin.userId}"]`)).toHaveCount(0, { timeout: 20_000 });
		await expect(page.locator(`[id="select-user-${users[0].userId}"]`)).toBeVisible();
	});

	test('marks and protects the root admin the server names, not the earliest registered user', async ({ page }) => {
		const account = (userId: string, registrationDate: number, isRootAdmin: boolean): MeetUserDTO => ({
			userId,
			name: userId,
			role: MeetUserRole.ADMIN,
			registrationDate,
			roleUpdatedAt: registrationDate,
			isRootAdmin
		});
		await page.route('**/api/v1/users?*', async (route) => {
			if (route.request().method() !== 'GET') return route.continue();

			await route.fulfill({
				json: {
					users: [account('admin', 1_000, false), account('root_admin', 2_000, true)],
					pagination: { isTruncated: false, maxItems: 10 }
				}
			});
		});

		await gotoConsolePage(page, 'users', 'ov-users-lists');

		await expect(page.locator('[id="badge-root-root_admin"]')).toBeVisible();
		await expect(page.locator('[id="select-user-root_admin"]')).toHaveCount(0);
		await expect(page.locator('[id="delete-user-btn-root_admin"]')).toBeDisabled();

		await expect(page.locator('[id="badge-root-admin"]')).toHaveCount(0);
		await expect(page.locator('[id="select-user-admin"]')).toBeVisible();
		await expect(page.locator('[id="delete-user-btn-admin"]')).toBeEnabled();
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
	const emptyList = { recordings: [], pagination: { isTruncated: false, maxItems: 50 } };
	/** The list hides its toolbar and filter panel while it is empty and unfiltered. */
	const oneRecording = {
		recordings: [
			{
				recordingId: 'room--EG_1--x',
				roomId: 'room',
				roomName: 'room',
				status: 'complete',
				startDate: 1_700_000_000_000,
				duration: 10,
				size: 1024
			}
		],
		pagination: { isTruncated: false, maxItems: 50 }
	};

	test('renders the recordings list rather than an error page', async ({ page }) => {
		await gotoConsolePage(page, 'recordings', 'ov-recording-lists');

		await expect(page.locator('.error-page')).toHaveCount(0);
	});

	test('the failed figure filters by its three statuses and clears when selected again', async ({ page }) => {
		const statusesRequested: (string | null)[] = [];
		await page.route('**/internal-api/v1/recordings/summary', (route) =>
			route.fulfill({
				json: { totalRecordings: 5, completeRecordings: 2, recordingsInProgress: 1, failedRecordings: 2 }
			})
		);
		await page.route('**/api/v1/recordings?*', (route) => {
			statusesRequested.push(new URL(route.request().url()).searchParams.get('status'));
			return route.fulfill({ json: emptyList });
		});
		await gotoConsolePage(page, 'recordings', 'ov-recording-lists');
		await expect(figureCount(page, 'failed')).toHaveText('2');

		await figure(page, 'failed').click();

		await expect(figure(page, 'failed')).toHaveAttribute('aria-pressed', 'true');
		await expect(page).toHaveURL(/status=failed,aborted,limit_reached/);
		await expect.poll(() => statusesRequested.at(-1)).toBe('failed,aborted,limit_reached');
		await expect(page.locator('.ov-active-filters .filter-chip')).toContainText('Failed, Aborted, Limit Reached');

		await figure(page, 'failed').click();

		await expect(figure(page, 'all')).toHaveAttribute('aria-pressed', 'true');
		await expect.poll(() => statusesRequested.at(-1)).toBeNull();
	});

	test('choosing several statuses in the status filter lists them all', async ({ page }) => {
		const statusesRequested: (string | null)[] = [];
		await page.route('**/api/v1/recordings?*', (route) => {
			statusesRequested.push(new URL(route.request().url()).searchParams.get('status'));
			return route.fulfill({ json: oneRecording });
		});
		await gotoConsolePage(page, 'recordings', 'ov-recording-lists');

		await chooseRecordingStatuses(page, ['Failed', 'Aborted']);

		await expect.poll(() => statusesRequested.at(-1)).toBe('failed,aborted');
		await expect(page).toHaveURL(/status=failed,aborted/);
	});

	test('on a phone the figures are one card whose chips filter the list', async ({ page }) => {
		const statusesRequested: (string | null)[] = [];
		await page.route('**/internal-api/v1/recordings/summary', (route) =>
			route.fulfill({
				json: { totalRecordings: 5, completeRecordings: 2, recordingsInProgress: 1, failedRecordings: 2 }
			})
		);
		await page.route('**/api/v1/recordings?*', (route) => {
			statusesRequested.push(new URL(route.request().url()).searchParams.get('status'));
			return route.fulfill({ json: emptyList });
		});
		await page.setViewportSize({ width: 390, height: 844 });
		await gotoConsolePage(page, 'recordings', 'ov-recording-lists');

		await expect(page.locator('ov-list-figures .tile')).toHaveCount(0);
		await expect(page.locator('ov-list-figures .card-total-count')).toHaveText('5');
		await expect(page.locator('ov-list-figures .bar .segment')).toHaveCount(3);
		await expect(page.locator('ov-list-figures .card-chip')).toHaveCount(4);
		await expect(figure(page, 'all')).toHaveAttribute('aria-pressed', 'true');

		await figure(page, 'failed').click();

		await expect(figure(page, 'failed')).toHaveAttribute('aria-pressed', 'true');
		await expect.poll(() => statusesRequested.at(-1)).toBe('failed,aborted,limit_reached');

		await figure(page, 'all').click();

		await expect(figure(page, 'all')).toHaveAttribute('aria-pressed', 'true');
		await expect.poll(() => statusesRequested.at(-1)).toBeNull();
	});

	test('shows no figures when there is nothing to count or the figures cannot be read', async ({ page }) => {
		await page.route('**/api/v1/recordings?*', (route) => route.fulfill({ json: emptyList }));
		await page.route('**/internal-api/v1/recordings/summary', (route) =>
			route.fulfill({
				json: { totalRecordings: 0, completeRecordings: 0, recordingsInProgress: 0, failedRecordings: 0 }
			})
		);
		await gotoConsolePage(page, 'recordings', 'ov-recording-lists');
		await expect(page.locator('ov-list-figures')).toHaveCount(0);

		await page.unroute('**/internal-api/v1/recordings/summary');
		await page.route('**/internal-api/v1/recordings/summary', (route) =>
			route.fulfill({ status: 500, body: '{}' })
		);
		await page.reload();

		await expect(page.locator('ov-recording-lists')).toBeVisible({ timeout: 20_000 });
		await expect(page.locator('ov-list-figures')).toHaveCount(0);
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

		await page
			.getByRole('tab')
			.filter({ hasText: /member/i })
			.first()
			.click();

		await expect(page.locator('ov-room-members-list')).toBeVisible({ timeout: 20_000 });
	});

	test('the recordings tab filters by several statuses', async ({ page }) => {
		const statusesRequested: (string | null)[] = [];
		await page.route('**/api/v1/recordings?*', (route) => {
			statusesRequested.push(new URL(route.request().url()).searchParams.get('status'));
			return route.fulfill({
				json: {
					recordings: [
						{
							recordingId: 'room--EG_1--x',
							roomId: room.roomId,
							roomName: room.roomName,
							status: 'complete'
						}
					],
					pagination: { isTruncated: false, maxItems: 50 }
				}
			});
		});
		await gotoRoomDetail(page, room.roomId);
		await expect(page.locator('ov-recording-lists')).toBeVisible({ timeout: 20_000 });

		await chooseRecordingStatuses(page, ['Failed', 'Aborted']);

		await expect.poll(() => statusesRequested.at(-1)).toBe('failed,aborted');
	});

	test('the member form disables a permission while the one it needs is off', async ({ page }) => {
		const permissionSwitch = (key: string) => page.locator(`#member-permission-${key} button`);

		await page.goto(`${MEET_BASE_URL}/rooms/${room.roomId}/members/new`, { waitUntil: 'domcontentloaded' });
		await page.locator('.permissions-panel mat-expansion-panel-header').click();
		await expect(permissionSwitch('chatRead')).toBeVisible({ timeout: 20_000 });

		// The speaker base role denies broadcastControl, so adding destinations starts unavailable.
		await expect(permissionSwitch('broadcastEdit')).toBeDisabled();

		for (const [dependent, parent] of [
			['chatWrite', 'chatRead'],
			['mediaChangeVirtualBackground', 'mediaPublishVideo']
		]) {
			await permissionSwitch(parent).click();
			await expect(permissionSwitch(dependent)).toBeDisabled();
			await expect(permissionSwitch(dependent)).toHaveAttribute('aria-checked', 'true');

			await permissionSwitch(parent).click();
			await expect(permissionSwitch(dependent)).toBeEnabled();
		}

		await page.locator('mat-select[formcontrolname="role"]').click();
		await page.getByRole('option', { name: /moderator/i }).click();
		await expect(permissionSwitch('broadcastEdit')).toBeEnabled();
	});

	test('shows the notice of copying a member link in the selected language', async ({ page }) => {
		const member = await createRoomMember(room.roomId, {
			name: 'Invitada',
			baseRole: MeetRoomMemberRole.SPEAKER
		});
		await gotoRoomDetail(page, room.roomId);
		await page.locator('#language-selector-btn').click();
		await page.locator('#lang-opt-es').click();
		await page.getByRole('tab').nth(1).click();

		await page.locator(`#copy-member-link-btn-${member.memberId}`).click();

		await expect(page.locator('.ov-notification[data-kind="message"] .notification-message')).toHaveText(
			'Enlace de acceso del miembro copiado al portapapeles'
		);
	});

	test('shows the notice of deleting the room in the selected language', async ({ page }) => {
		await gotoRoomDetail(page, room.roomId);
		await page.locator('#language-selector-btn').click();
		await page.locator('#lang-opt-es').click();

		await page.locator('.icon-action-btn.delete-btn').click();
		await confirmDialog(page);

		await expect(page.locator('.ov-notification[data-kind="message"] .notification-message')).toHaveText(
			'Sala eliminada correctamente'
		);
	});
});

// ─── Profile ─────────────────────────────────────────────────────────────────

test.describe('Console profile E2E Tests', () => {
	test('changing the password keeps the user signed in', async ({ browser }) => {
		const { user } = await createReadyUser(`${RUN_ID}-pw`, MeetUserRole.ADMIN);
		const context = await browser.newContext();
		const page = await context.newPage();

		try {
			await authenticate(page, user);
			await page.goto(`${MEET_BASE_URL}/profile`, { waitUntil: 'domcontentloaded' });

			const newPassword = `${user.password}x`;
			await page.locator('input[formcontrolname="currentPassword"]').fill(user.password);
			await page.locator('input[formcontrolname="newPassword"]').fill(newPassword);
			await page.locator('input[formcontrolname="confirmPassword"]').fill(newPassword);
			await page.locator('form button[type="submit"]').click();
			await expectNotification(page);

			await gotoConsolePage(page, 'users', 'ov-users-lists');
			await expectNoLoginPage(page);
		} finally {
			await context.close();
			await cleanupUsers([user.userId]);
		}
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
		await expectNotification(page);
		await expect(page.locator(`[id="select-user-${users[0].userId}"]`)).toBeVisible();
	});
});
