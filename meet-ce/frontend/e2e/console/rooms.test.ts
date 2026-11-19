import { MeetRoom, MeetRoomMemberRole, MeetUserRole } from '@openvidu-meet/typings';
import { expect, test, type Page } from '@playwright/test';
import { createReadyUser, type ReadyUser } from '../helpers/auth.helper';
import {
	asUser,
	bulkDelete,
	cleanupRooms,
	cleanupUsers,
	clearSearchAndExpectAtLeast,
	confirmDialog,
	expectNotification,
	figure,
	figureCount,
	gotoConsolePage,
	listRows,
	loadMoreButton,
	newRunId,
	searchAndExpectRows,
	signInAdminBeforeEach,
	startMeeting
} from '../helpers/console.helper';
import { closeRoom, createRoom, createRoomAsUser, createRoomMember } from '../helpers/meet-api.helper';
import { recordRoom } from '../helpers/recordings.helper';
import { expectCopiedText, installClipboardCapture } from '../helpers/ui-utils.helper';

const RUN_ID = newRunId();

/** The dialog offering the deletion policies, which opens when the first deletion attempt is refused. */
const policiesDialog = (page: Page) => page.locator('ov-delete-room-dialog');

/** Holds the answers of the rooms list until the returned function releases them. */
const holdRoomListRequests = async (page: Page): Promise<() => void> => {
	let release!: () => void;
	const released = new Promise<void>((resolve) => (release = resolve));
	await page.route('**/api/v1/rooms?*', async (route) => {
		await released;
		await route.fallback();
	});
	return release;
};

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

	test('selecting the text of a room name does not open the room', async ({ page }) => {
		await gotoConsolePage(page, 'rooms', 'ov-rooms-lists');
		const name = page.locator(`[id="room-name-${rooms[0].roomId}"]`);
		await expect(name).toBeVisible({ timeout: 20_000 });
		const box = (await name.boundingBox())!;

		await page.mouse.move(box.x + 1, box.y + box.height / 2);
		await page.mouse.down();
		await page.mouse.move(box.x + box.width - 1, box.y + box.height / 2, { steps: 5 });
		await page.mouse.up();

		expect(await page.evaluate(() => window.getSelection()?.toString())).toContain(rooms[0].roomName);
		await expect(page.locator('ov-room-detail')).toHaveCount(0);
		expect(page.url()).not.toContain(rooms[0].roomId);
	});

	test('a Ctrl click on a room opens it in a new tab and leaves the list as it is', async ({ page, context }) => {
		await gotoConsolePage(page, 'rooms', 'ov-rooms-lists');
		const newTab = context.waitForEvent('page');

		await page.locator(`[id="room-name-cell-${rooms[0].roomId}"]`).click({ modifiers: ['Control'] });

		const tab = await newTab;
		await expect(tab.locator('ov-room-detail')).toBeVisible({ timeout: 20_000 });
		expect(tab.url()).toContain(rooms[0].roomId);
		expect(page.url()).not.toContain(rooms[0].roomId);
		await expect(page.locator(`[id="select-room-${rooms[0].roomId}"]`)).toBeVisible();
	});

	test('the status filter and the sort stay in the URL and a reload shows the same list', async ({ page }) => {
		await closeRoom(rooms[0].roomId);
		await closeRoom(rooms[1].roomId);
		await gotoConsolePage(page, 'rooms', 'ov-rooms-lists');

		await page.locator('ov-rooms-lists .ov-filters-trigger').click();
		await page.locator('#status-filter-select').click();
		await page.locator('#status-option-closed').click();
		await page.locator('#room-name-header').click();

		await expect(page).toHaveURL(/status=closed/);
		await expect(page).toHaveURL(/sort=roomName/);
		await expect(page).toHaveURL(/order=asc/);
		await expect(page.locator(`[id="select-room-${rooms[2].roomId}"]`)).toHaveCount(0, { timeout: 20_000 });

		await page.reload();

		await expect(page.locator('ov-rooms-lists .ov-active-filters .filter-chip')).toContainText('Closed');
		await expect(page.locator('#room-name-header')).toHaveAttribute('aria-sort', 'ascending');
		await expect(page.locator(`[id="select-room-${rooms[0].roomId}"]`)).toBeVisible({ timeout: 20_000 });
		await expect(page.locator(`[id="select-room-${rooms[2].roomId}"]`)).toHaveCount(0);
	});

	test('a list that reloads keeps its rows dimmed and shows placeholder rows when it has none', async ({ page }) => {
		await gotoConsolePage(page, 'rooms', 'ov-rooms-lists');

		let release = await holdRoomListRequests(page);
		await page.locator('#refresh-btn').click();

		await expect(page.locator('#table-container')).toHaveClass(/is-loading/);
		await expect(page.locator(`[id="select-room-${rooms[0].roomId}"]`)).toBeVisible();
		release();
		await expect(page.locator('#table-container')).not.toHaveClass(/is-loading/);

		await searchAndExpectRows(page, `${RUN_ID}-no-such-room`, 0);
		release = await holdRoomListRequests(page);
		await page.locator('#search-input').fill('');
		await page.locator('#search-input').press('Enter');

		await expect(page.locator('ov-skeleton-rows')).toBeVisible();
		release();
		await expect(listRows(page).first()).toBeVisible({ timeout: 20_000 });
	});

	test('a closed room has access and share disabled and its toggle offers to reopen it', async ({ page }) => {
		const { roomId } = rooms[0];
		await closeRoom(roomId);
		await gotoConsolePage(page, 'rooms', 'ov-rooms-lists');
		await expect(page.locator(`[id="select-room-${roomId}"]`)).toBeVisible({ timeout: 20_000 });

		await expect(page.locator(`[id="access-room-btn-${roomId}"]`)).toBeDisabled();
		await page.locator(`[id="more-actions-btn-${roomId}"]`).click();
		await expect(page.locator(`[id="share-link-btn-${roomId}"]`)).toBeDisabled();
		await expect(page.locator(`[id="toggle-room-status-btn-${roomId}"]`)).toContainText('Open room');

		await page.locator(`[id="toggle-room-status-btn-${roomId}"]`).click();

		await expectNotification(page);
		await expect(page.locator(`[id="access-room-btn-${roomId}"]`)).toBeEnabled();
	});

	test('the share dialog of a room copies its speaker link', async ({ page }) => {
		await gotoConsolePage(page, 'rooms', 'ov-rooms-lists');
		await installClipboardCapture(page);
		await page.locator(`[id="more-actions-btn-${rooms[0].roomId}"]`).click();
		await page.locator(`[id="share-link-btn-${rooms[0].roomId}"]`).click();

		await page.getByRole('radio', { name: /Anonymous Speaker/ }).click();
		await page.getByRole('button', { name: 'Get Link' }).click();
		await page.locator('.copy-button').click();

		await expectCopiedText(page, rooms[0].access.anonymous.speaker.url);
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

test.describe('Console Rooms list by role E2E Tests', () => {
	let manager: ReadyUser;
	let managerToken: string;
	let member: ReadyUser;
	let ownedRoom: MeetRoom;
	let memberRoom: MeetRoom;
	let openRoom: MeetRoom;
	let hiddenRoom: MeetRoom;

	test.beforeAll(async () => {
		const [managerCreated, memberCreated] = await Promise.all([
			createReadyUser('Console manager', MeetUserRole.ROOM_MANAGER),
			createReadyUser('Console member', MeetUserRole.ROOM_MEMBER)
		]);
		manager = managerCreated.user;
		managerToken = managerCreated.accessToken;
		member = memberCreated.user;

		ownedRoom = await createRoomAsUser(managerToken, { roomName: `${RUN_ID}-owned` });
		memberRoom = await createRoom({ roomName: `${RUN_ID}-member` });
		openRoom = await createRoom({ roomName: `${RUN_ID}-open`, access: { user: { enabled: true } } });
		hiddenRoom = await createRoom({ roomName: `${RUN_ID}-hidden` });
		await createRoomMember(memberRoom.roomId, { userId: member.userId, baseRole: MeetRoomMemberRole.SPEAKER });
		await createRoomMember(memberRoom.roomId, { userId: manager.userId, baseRole: MeetRoomMemberRole.SPEAKER });
	});

	test.afterAll(async () => {
		await cleanupRooms([ownedRoom, memberRoom, openRoom, hiddenRoom].map((room) => room.roomId));
		await cleanupUsers([manager.userId, member.userId]);
	});

	test('a room_member user lists the rooms they belong to and the open ones, without a create button', async ({
		browser
	}) => {
		await asUser(browser, member, async (page) => {
			await gotoConsolePage(page, 'rooms', 'ov-rooms-lists');
			await searchAndExpectRows(page, RUN_ID, 2);

			await expect(page.locator(`[id="select-cell-${memberRoom.roomId}"]`)).toBeVisible();
			await expect(page.locator(`[id="select-cell-${openRoom.roomId}"]`)).toBeVisible();
			await expect(page.locator('#create-room-btn')).toHaveCount(0);

			await page.locator('ov-rooms-lists .ov-filters-trigger').click();
			await expect(page.locator('#owned-rooms-checkbox')).toHaveCount(0);
			await page.locator('#user-access-checkbox input').check();

			await expect(page.locator(`[id="select-cell-${memberRoom.roomId}"]`)).toHaveCount(0, { timeout: 20_000 });
			await expect(page.locator(`[id="select-cell-${openRoom.roomId}"]`)).toBeVisible();
		});
	});

	test('a room_manager user manages the rooms they own and only opens the ones they belong to', async ({
		browser
	}) => {
		await asUser(browser, manager, async (page) => {
			await gotoConsolePage(page, 'rooms', 'ov-rooms-lists');
			await searchAndExpectRows(page, RUN_ID, 3);
			await expect(page.locator(`[id="select-cell-${hiddenRoom.roomId}"]`)).toHaveCount(0);

			await expect(page.locator(`[id="access-room-btn-${ownedRoom.roomId}"]`)).toBeEnabled();
			await expect(page.locator(`[id="edit-room-btn-${ownedRoom.roomId}"]`)).toBeEnabled();
			await expect(page.locator(`[id="select-room-${ownedRoom.roomId}"]`)).toBeVisible();
			await page.locator(`[id="more-actions-btn-${ownedRoom.roomId}"]`).click();
			await expect(page.locator(`[id="share-link-btn-${ownedRoom.roomId}"]`)).toBeEnabled();
			await expect(page.locator(`[id="toggle-room-status-btn-${ownedRoom.roomId}"]`)).toBeVisible();
			await expect(page.locator(`[id="delete-room-btn-${ownedRoom.roomId}"]`)).toBeVisible();
			await page.keyboard.press('Escape');

			await expect(page.locator(`[id="access-room-btn-${memberRoom.roomId}"]`)).toBeEnabled();
			await expect(page.locator(`[id="edit-room-btn-${memberRoom.roomId}"]`)).toHaveCount(0);
			await expect(page.locator(`[id="more-actions-btn-${memberRoom.roomId}"]`)).toHaveCount(0);
			await expect(page.locator(`[id="select-room-${memberRoom.roomId}"]`)).toHaveCount(0);

			await page.locator('ov-rooms-lists .ov-filters-trigger').click();
			await expect(page.locator('#owned-rooms-checkbox')).toBeVisible();
			await expect(page.locator('#member-rooms-checkbox')).toBeVisible();
			await expect(page.locator('#user-access-checkbox')).toBeVisible();
		});
	});

	test('an admin filters the rooms by owner, member and user access', async ({ page }) => {
		await gotoConsolePage(page, 'rooms', 'ov-rooms-lists');

		await page.locator('ov-rooms-lists .ov-filters-trigger').click();

		await expect(page.locator('#owner-filter-input')).toBeVisible();
		await expect(page.locator('#member-filter-input')).toBeVisible();
		await expect(page.locator('#user-access-checkbox')).toBeVisible();
		await expect(page.locator('#owned-rooms-checkbox')).toHaveCount(0);
	});
});

test.describe('Console Rooms with a meeting E2E Tests', () => {
	let rooms: MeetRoom[];

	test.beforeEach(async () => {
		rooms = await Promise.all(['idle', 'busy'].map((suffix) => createRoom({ roomName: `${RUN_ID}-${suffix}` })));
	});

	test.afterEach(async () => {
		await cleanupRooms(rooms.map((room) => room.roomId));
	});

	test('a room in a meeting has edit disabled and deleting it offers the policies to retry with', async ({
		page,
		browser
	}) => {
		const [, busy] = rooms;
		const meeting = await startMeeting(browser, busy);

		try {
			await gotoConsolePage(page, 'rooms', 'ov-rooms-lists');
			await expect(page.locator(`[id="status-label-${busy.roomId}"]`)).toHaveText('Active meeting', {
				timeout: 20_000
			});
			await expect(page.locator(`[id="edit-room-btn-${busy.roomId}"]`)).toBeDisabled();

			await page.locator(`[id="more-actions-btn-${busy.roomId}"]`).click();
			await page.locator(`[id="delete-room-btn-${busy.roomId}"]`).click();
			await confirmDialog(page);

			await expect(policiesDialog(page).locator('.dialog-message')).toContainText('has an active meeting');
			await policiesDialog(page).locator('.policy-section').first().getByRole('radio', { name: /Force/ }).click();
			const retry = page.waitForRequest((request) => request.method() === 'DELETE');
			await policiesDialog(page).locator('.confirm-button').click();

			expect(new URL((await retry).url()).searchParams.get('withMeeting')).toBe('force');
			await expect(page.locator(`[id="select-room-${busy.roomId}"]`)).toHaveCount(0, { timeout: 20_000 });
		} finally {
			await meeting.end();
		}
	});

	test('the retry of a bulk deletion covers only the rooms that failed', async ({ page, browser }) => {
		const [idle, busy] = rooms;
		const meeting = await startMeeting(browser, busy);

		try {
			await gotoConsolePage(page, 'rooms', 'ov-rooms-lists');
			await expect(page.locator(`[id="status-label-${busy.roomId}"]`)).toHaveText('Active meeting', {
				timeout: 20_000
			});

			await bulkDelete(page, [idle.roomId, busy.roomId], 'select-room-');

			await expect(policiesDialog(page).locator('.dialog-message')).toContainText(busy.roomId);
			await expect(page.locator(`[id="select-room-${idle.roomId}"]`)).toHaveCount(0, { timeout: 20_000 });
			await policiesDialog(page).locator('.policy-section').first().getByRole('radio', { name: /Force/ }).click();
			const retry = page.waitForRequest((request) => request.method() === 'DELETE');
			await policiesDialog(page).locator('.confirm-button').click();

			expect(new URL((await retry).url()).searchParams.get('roomIds')).toBe(busy.roomId);
			await expect(page.locator(`[id="select-room-${busy.roomId}"]`)).toHaveCount(0, { timeout: 20_000 });
		} finally {
			await meeting.end();
		}
	});
});

test.describe('Console Rooms with recordings E2E Tests', () => {
	let room: MeetRoom;

	test.beforeAll(async ({ browser }) => {
		room = await createRoom({ roomName: `${RUN_ID}-recorded` });
		await recordRoom(browser, room.roomId);
	});

	test.afterAll(async () => {
		await cleanupRooms([room.roomId]);
	});

	test('deleting a room with recordings offers to close it, which keeps it in the list as closed', async ({
		page
	}) => {
		await gotoConsolePage(page, 'rooms', 'ov-rooms-lists');
		await page.locator(`[id="more-actions-btn-${room.roomId}"]`).click();
		await page.locator(`[id="delete-room-btn-${room.roomId}"]`).click();
		await confirmDialog(page);

		await expect(policiesDialog(page).locator('.dialog-message')).toContainText('has recordings');
		await policiesDialog(page).locator('.policy-section').last().getByRole('radio', { name: /Close/ }).click();
		await confirmDialog(page);

		await expect(page.locator('.ov-notification[data-kind="message"] .notification-message')).toHaveText(
			'Room closed instead of deleted because it has recordings'
		);
		await expect(page.locator(`[id="status-label-${room.roomId}"]`)).toHaveText('Closed');
	});

	test('the notice of a room closed instead of deleted is shown in the selected language', async ({ page }) => {
		await gotoConsolePage(page, 'rooms', 'ov-rooms-lists');
		await page.locator('#language-selector-btn').click();
		await page.locator('#lang-opt-fr').click();
		await page.locator(`[id="more-actions-btn-${room.roomId}"]`).click();
		await page.locator(`[id="delete-room-btn-${room.roomId}"]`).click();
		await confirmDialog(page);
		await policiesDialog(page).locator('.confirm-button').click();

		await expect(page.locator('.ov-notification[data-kind="message"] .notification-message')).toHaveText(
			"Salle fermée au lieu d'être supprimée car elle contient des enregistrements"
		);
	});
});
