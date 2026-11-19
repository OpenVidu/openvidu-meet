import { MeetUserDTO, MeetUserRole } from '@openvidu-meet/typings';
import { expect, test, type Locator, type Page } from '@playwright/test';
import {
	authenticate,
	createReadyUser,
	expectNoLoginPage,
	openSignedInPage,
	performLogin
} from '../helpers/auth.helper';
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
import { createUser, deleteUsers, getUserAccessToken, MEET_BASE_URL } from '../helpers/meet-api.helper';

const RUN_ID = newRunId();

const makeUser = (suffix: string): Promise<MeetUserDTO> => {
	const userId = `${RUN_ID}_${suffix}`;
	return createUser({ userId, name: userId, role: MeetUserRole.ROOM_MANAGER, password: 'changeme1' });
};

const admin = signInAdminBeforeEach();

const NEW_PASSWORD = 'changed22';

const message = (page: Page, text: string): Locator =>
	page.locator('.ov-notification[data-kind="message"]', { hasText: text });

const dialog = (page: Page): Locator => page.getByRole('dialog');

const chooseRole = async (page: Page, role: RegExp): Promise<void> => {
	await dialog(page).locator('mat-select').click();
	await page.getByRole('option', { name: role }).click();
	await expect(page.getByRole('option')).toHaveCount(0);
};

const submitPasswordChange = async (page: Page, current: string, next: string): Promise<void> => {
	await page.locator('input[formcontrolname="currentPassword"]').fill(current);
	await page.locator('input[formcontrolname="newPassword"]').fill(next);
	await page.locator('input[formcontrolname="confirmPassword"]').fill(next);
	await page.locator('form button[type="submit"]').click();
};

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

test.describe('Console user actions E2E Tests', () => {
	const created: string[] = [];
	let users: MeetUserDTO[];

	test.beforeEach(async () => {
		users = await Promise.all([makeUser('ra'), makeUser('rb')]);
	});

	test.afterEach(async () => {
		await cleanupUsers([...users.map((user) => user.userId), ...created.splice(0)]);
	});

	test('creates a user with the room manager role preselected and a generated, copyable temporary password', async ({
		page
	}) => {
		const userId = `${RUN_ID}_cr`;
		created.push(userId);
		await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
		await gotoConsolePage(page, 'users', 'ov-users-lists');

		await page.locator('#create-user-btn').click();

		await expect(page).toHaveURL(`${MEET_BASE_URL}/users/new`);
		await expect(page.locator('mat-select[formcontrolname="role"]')).toContainText('Room Manager');
		await page.locator('input[formcontrolname="userId"]').fill(userId);
		await page.locator('input[formcontrolname="name"]').fill('Created user');

		const passwordInput = page.locator('input[formcontrolname="password"]');
		await page.getByRole('button', { name: 'Auto-generate' }).click();
		await expect(passwordInput).not.toHaveValue('');
		await expect(passwordInput).toHaveAttribute('type', 'text');
		const password = await passwordInput.inputValue();

		await page.locator('button', { has: page.locator('mat-icon', { hasText: 'content_copy' }) }).click();
		await expect(message(page, 'Password copied to clipboard')).toBeVisible();
		expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(password);

		await page.getByRole('button', { name: 'Create User' }).click();

		await expect(message(page, 'User created successfully')).toBeVisible();
		await expect(page).toHaveURL(`${MEET_BASE_URL}/users`);
		await expect(page.locator(`[id="select-user-${userId}"]`)).toBeVisible({ timeout: 20_000 });
		await expect(page.locator(`[id="role-chip-${userId}"]`)).toContainText('Room Manager');
		await expect(getUserAccessToken(userId, password, NEW_PASSWORD)).resolves.toBeTruthy();
	});

	test('the role dialog warns about what a change to room member or admin does, and saves the new role', async ({
		page
	}) => {
		const [target] = users;
		const ownershipWarning = 'If this user owns rooms, ownership will be transferred to the root admin.';
		const membershipWarning = 'All room memberships of this user will be removed';
		await gotoConsolePage(page, 'users', 'ov-users-lists');
		await searchAndExpectRows(page, target.userId, 1);

		await page.locator(`[id="update-role-btn-${target.userId}"]`).click();
		const saveRole = dialog(page).getByRole('button', { name: 'Save Role' });
		await expect(saveRole).toBeDisabled();
		await expect(dialog(page).locator('.warning-banner')).toHaveCount(0);

		await chooseRole(page, /Room Member/);
		await expect(dialog(page)).toContainText(ownershipWarning);
		await expect(dialog(page)).not.toContainText(membershipWarning);

		await chooseRole(page, /Admin/);
		await expect(dialog(page)).toContainText(membershipWarning);
		await expect(dialog(page)).not.toContainText(ownershipWarning);

		await saveRole.click();

		await expect(message(page, `Role for ${target.name} updated to Admin`)).toBeVisible();
		await expect(page.locator(`[id="role-chip-${target.userId}"]`)).toContainText('Admin');
	});

	test('resetting a password sets the generated temporary one', async ({ page }) => {
		const [target] = users;
		await gotoConsolePage(page, 'users', 'ov-users-lists');
		await searchAndExpectRows(page, target.userId, 1);

		await page.locator(`[id="reset-password-btn-${target.userId}"]`).click();
		const passwordInput = dialog(page).locator('input');
		await dialog(page).getByRole('button', { name: 'Auto-generate' }).click();
		await expect(passwordInput).not.toHaveValue('');
		const password = await passwordInput.inputValue();
		await dialog(page).getByRole('button', { name: 'Reset Password' }).click();

		await expect(message(page, `Password reset successfully for ${target.name}`)).toBeVisible();
		await expect(getUserAccessToken(target.userId, password, NEW_PASSWORD)).resolves.toBeTruthy();
	});

	test('a bulk delete where one user was deleted meanwhile removes the others and reports the failure', async ({
		page
	}) => {
		const [removed, gone] = users;
		await gotoConsolePage(page, 'users', 'ov-users-lists');
		await expect(page.locator(`[id="select-user-${gone.userId}"]`)).toBeVisible({ timeout: 20_000 });
		await deleteUsers([gone.userId]);

		await bulkDelete(
			page,
			users.map((user) => user.userId),
			'select-user-'
		);

		await expect(message(page, '1 user deleted successfully. 1 user could not be deleted.')).toBeVisible();
		await expect(page.locator(`[id="select-user-${removed.userId}"]`)).toHaveCount(0);
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

	test('a wrong current password is marked as incorrect and the password stays', async ({ browser }) => {
		const { user } = await createReadyUser(`${RUN_ID}-wrong`, MeetUserRole.ADMIN);
		const page = await openSignedInPage(browser, user);

		try {
			await page.goto(`${MEET_BASE_URL}/profile`, { waitUntil: 'domcontentloaded' });
			await expect(page.locator('input[formcontrolname="currentPassword"]')).toBeVisible({ timeout: 20_000 });

			await submitPasswordChange(page, `${user.password}x`, NEW_PASSWORD);

			await expect(page.locator('mat-error')).toHaveText('Current password is incorrect');
			await expect(getUserAccessToken(user.userId, user.password, user.password)).resolves.toBeTruthy();
		} finally {
			await page.context().close();
			await cleanupUsers([user.userId]);
		}
	});

	test('a new password equal to the current one is rejected', async ({ browser }) => {
		const { user } = await createReadyUser(`${RUN_ID}-same`, MeetUserRole.ADMIN);
		const page = await openSignedInPage(browser, user);

		try {
			await page.goto(`${MEET_BASE_URL}/profile`, { waitUntil: 'domcontentloaded' });
			await page.locator('input[formcontrolname="currentPassword"]').fill(user.password);
			await page.locator('input[formcontrolname="newPassword"]').fill(user.password);
			await page.locator('input[formcontrolname="newPassword"]').blur();

			await expect(page.locator('mat-error')).toHaveText('New password must be different from current password');
			await page.locator('input[formcontrolname="confirmPassword"]').fill(user.password);
			await expect(page.getByRole('button', { name: 'Update Password' })).toBeDisabled();
		} finally {
			await page.context().close();
			await cleanupUsers([user.userId]);
		}
	});

	test('a room manager sees the details of another user without any action', async ({ browser }) => {
		const { user } = await createReadyUser(`${RUN_ID}-rm`, MeetUserRole.ROOM_MANAGER);
		const page = await openSignedInPage(browser, user);

		try {
			await page.goto(`${MEET_BASE_URL}/users/${admin().userId}`, { waitUntil: 'domcontentloaded' });

			await expect(page.getByRole('heading', { name: 'User Profile' })).toBeVisible({ timeout: 20_000 });
			await expect(page.locator('.info-value')).toHaveText(admin().userId);
			await expect(page.getByRole('heading', { name: admin().name })).toBeVisible();
			await expect(page.getByText('Admin Actions')).toHaveCount(0);
			await expect(page.getByRole('button', { name: /Update Role|Reset Password|Delete User/ })).toHaveCount(0);
			await expect(page.locator('input[formcontrolname="currentPassword"]')).toHaveCount(0);
		} finally {
			await page.context().close();
			await cleanupUsers([user.userId]);
		}
	});

	test('the id of the signed-in user on the Users list opens their own profile', async ({ browser }) => {
		const { user } = await createReadyUser(`${RUN_ID}-self`, MeetUserRole.ADMIN);
		const page = await openSignedInPage(browser, user);

		try {
			await gotoConsolePage(page, 'users', 'ov-users-lists');
			await searchAndExpectRows(page, user.name, 1);

			await page.locator(`[id="user-id-${user.userId}"]`).click();

			await expect(page).toHaveURL(`${MEET_BASE_URL}/profile`);
			await expect(page.getByRole('heading', { name: 'Profile', exact: true })).toBeVisible({ timeout: 20_000 });
			await expect(page.locator('input[formcontrolname="currentPassword"]')).toBeVisible();
		} finally {
			await page.context().close();
			await cleanupUsers([user.userId]);
		}
	});
});

test.describe('Console forced password change E2E Tests', () => {
	let user: MeetUserDTO;
	const initialPassword = 'changeme1';

	test.beforeEach(async () => {
		const userId = `${RUN_ID}_fp`;
		user = await createUser({ userId, name: userId, role: MeetUserRole.ADMIN, password: initialPassword });
	});

	test.afterEach(async () => {
		await cleanupUsers([user.userId]);
	});

	test('a first login asks for the change and then opens the page that was requested', async ({ browser }) => {
		const page = await (await browser.newContext()).newPage();

		try {
			await page.goto(`${MEET_BASE_URL}/users`, { waitUntil: 'domcontentloaded' });
			await performLogin(page, { userId: user.userId, password: initialPassword });

			await expect(page).toHaveURL(/\/change-password-required/);
			await expect(page.getByRole('heading', { name: 'Update Your Password' })).toBeVisible();

			await submitPasswordChange(page, initialPassword, NEW_PASSWORD);

			await expect(page.locator('ov-users-lists')).toBeVisible({ timeout: 20_000 });
			await expect(page).toHaveURL(`${MEET_BASE_URL}/users`);
		} finally {
			await page.context().close();
		}
	});

	test('other console pages stay out of reach until the change succeeds', async ({ browser }) => {
		const page = await (await browser.newContext()).newPage();

		try {
			await page.goto(MEET_BASE_URL, { waitUntil: 'domcontentloaded' });
			await performLogin(page, { userId: user.userId, password: initialPassword });
			await expect(page).toHaveURL(/\/change-password-required/);

			for (const path of ['rooms', 'users', 'overview']) {
				await page.goto(`${MEET_BASE_URL}/${path}`, { waitUntil: 'domcontentloaded' });

				await expect(page).toHaveURL(/\/change-password-required/);
				await expect(page.getByRole('heading', { name: 'Update Your Password' })).toBeVisible();
			}

			await submitPasswordChange(page, initialPassword, NEW_PASSWORD);

			await expect(page.locator('#nav-list')).toBeVisible({ timeout: 20_000 });
			await expect(page).not.toHaveURL(/\/change-password-required/);
		} finally {
			await page.context().close();
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
