import { MeetUserDTO, MeetUserRole } from '@openvidu-meet/typings';
import { expect, test } from '@playwright/test';
import { authenticate, createReadyUser, expectNoLoginPage } from '../helpers/auth.helper';
import {
	bulkDelete,
	cleanupUsers,
	confirmDialog,
	expectNotification,
	failBulkDelete,
	figure,
	gotoConsolePage,
	listRows,
	newRunId,
	searchAndExpectRows,
	signInAdminBeforeEach
} from '../helpers/console.helper';
import { createUser, MEET_BASE_URL } from '../helpers/meet-api.helper';

const RUN_ID = newRunId();

const makeUser = (suffix: string): Promise<MeetUserDTO> => {
	const userId = `${RUN_ID}_${suffix}`;
	return createUser({ userId, name: userId, role: MeetUserRole.ROOM_MANAGER, password: 'changeme1' });
};

const admin = signInAdminBeforeEach();

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
		await expect(page.locator(`[id="user-name-cell-${admin().userId}"]`)).toHaveCount(0, { timeout: 20_000 });
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
