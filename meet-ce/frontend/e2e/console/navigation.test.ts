import { MeetRoom, MeetUserRole } from '@openvidu-meet/typings';
import { expect, test, type Page } from '@playwright/test';
import { createReadyUser, openSignedInPage } from '../helpers/auth.helper';
import {
	cleanupRooms,
	cleanupUsers,
	gotoConsolePage,
	newRunId,
	searchAndExpectRows,
	signInAdminBeforeEach
} from '../helpers/console.helper';
import { createRoom, createRoomAsUser, MEET_BASE_URL } from '../helpers/meet-api.helper';

const RUN_ID = newRunId();

signInAdminBeforeEach();

const navigationLabels = (page: Page) => page.locator('#nav-list a');

/** Matches a navigation entry by its label, ignoring the icon ligature text the entry starts with. */
const entries = (...labels: string[]): RegExp[] => labels.map((label) => new RegExp(`\\s${label}\\s*$`));

test.describe('Console navigation E2E Tests', () => {
	test('lists the pages an admin reaches, in order', async ({ page }) => {
		await page.goto(MEET_BASE_URL, { waitUntil: 'domcontentloaded' });

		await expect(navigationLabels(page)).toHaveText(
			entries('Overview', 'Rooms', 'Recordings', 'Users', 'Embedded', 'Configuration')
		);
	});

	for (const role of [MeetUserRole.ROOM_MANAGER, MeetUserRole.ROOM_MEMBER]) {
		test(`lists only Rooms and Recordings to a ${role}`, async ({ browser }) => {
			const { user } = await createReadyUser(`${RUN_ID}-${role}`, role);
			const page = await openSignedInPage(browser, user);

			try {
				await page.goto(MEET_BASE_URL, { waitUntil: 'domcontentloaded' });

				await expect(navigationLabels(page)).toHaveText(entries('Rooms', 'Recordings'));
			} finally {
				await page.context().close();
				await cleanupUsers([user.userId]);
			}
		});
	}

	test('an unknown path inside or outside the console opens the overview', async ({ page }) => {
		for (const path of ['does-not-exist', 'does/not/exist']) {
			await page.goto(`${MEET_BASE_URL}/${path}`, { waitUntil: 'domcontentloaded' });

			await expect(page).toHaveURL(`${MEET_BASE_URL}/overview`);
			await expect(page.locator('ov-overview')).toBeVisible({ timeout: 20_000 });
		}
	});

	test('the profile button opens the profile inside the console', async ({ page }) => {
		await gotoConsolePage(page, 'recordings', 'ov-recording-lists');

		await page.locator('#profile-btn').click();

		await expect(page).toHaveURL(`${MEET_BASE_URL}/profile`);
		await expect(page.locator('ov-profile')).toBeVisible({ timeout: 20_000 });
		await expect(page.locator('#main-toolbar')).toBeVisible();
		await expect(navigationLabels(page)).toHaveCount(6);
	});

	test('collapsing the navigation keeps the icons with their labels as tooltips, and expanding shows the version', async ({
		page
	}) => {
		await gotoConsolePage(page, 'rooms', 'ov-rooms-lists');
		await expect(page.locator('#version-info')).toHaveText(/^v\d+\.\d+\.\d+\S* \(CE\)$/);

		await page.locator('#menu-toggle-btn').click();

		await expect(page.locator('#side-navigation')).toHaveClass(/collapsed/);
		await expect(page.locator('#version-info')).toHaveCount(0);
		await expect(navigationLabels(page)).toHaveCount(6);
		await expect(navigationLabels(page).first()).toHaveText('dashboard');
		await page.locator('#nav-link-users').hover();
		await expect(page.locator('.nav-tooltip')).toHaveText('Users');

		await page.locator('#menu-toggle-btn').click();

		await expect(page.locator('#side-navigation')).toHaveClass(/expanded/);
		await expect(page.locator('#version-info')).toBeVisible();
	});
});

test.describe('Console shell for a room manager E2E Tests', () => {
	test('a room opened from the rooms page keeps the console navigation and toolbar', async ({ browser }) => {
		const { user, accessToken } = await createReadyUser(`${RUN_ID}-shell`, MeetUserRole.ROOM_MANAGER);
		const room = await createRoomAsUser(accessToken, { roomName: `${RUN_ID}-shell-room` });
		const page = await openSignedInPage(browser, user);

		try {
			await gotoConsolePage(page, 'rooms', 'ov-rooms-lists');
			await page.locator(`[id="room-name-cell-${room.roomId}"]`).click();

			await expect(page.locator('ov-room-detail')).toBeVisible({ timeout: 20_000 });
			await expect(navigationLabels(page)).toHaveText(entries('Rooms', 'Recordings'));
			await expect(page.locator('#main-toolbar')).toBeVisible();
			await expect(page.locator('#logout-btn')).toBeVisible();
		} finally {
			await page.context().close();
			await cleanupRooms([room.roomId]);
			await cleanupUsers([user.userId]);
		}
	});
});

test.describe('Console language E2E Tests', () => {
	let room: MeetRoom;

	test.beforeEach(async () => {
		room = await createRoom({ roomName: `${RUN_ID}-lang` });
	});

	test.afterEach(async () => {
		await cleanupRooms([room.roomId]);
	});

	test('the language chosen in the console applies to the meeting entered from it', async ({ page }) => {
		await gotoConsolePage(page, 'rooms', 'ov-rooms-lists');
		await searchAndExpectRows(page, `${RUN_ID}-lang`, 1);
		await page.locator('#language-selector-btn').click();
		await page.locator('#lang-opt-es').click();

		const meeting = page.waitForEvent('popup');
		await page.locator(`[id="access-room-btn-${room.roomId}"]`).click();

		await expect((await meeting).getByRole('button', { name: 'Unirse a la reunión' })).toBeVisible({
			timeout: 30_000
		});
	});
});
