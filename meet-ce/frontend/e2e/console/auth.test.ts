import { expect, test } from '@playwright/test';
import { authenticate, createReadyUser, expectLoginPage, performLogin, type ReadyUser } from '../helpers/auth.helper';
import { cleanupUsers, gotoConsolePage } from '../helpers/console.helper';
import { MEET_BASE_URL } from '../helpers/meet-api.helper';
import { installTokenExpiryController } from '../helpers/token-refresh.helper';

test.describe('Console authentication E2E Tests', () => {
	let admin: ReadyUser;

	test.beforeAll(async () => {
		({ user: admin } = await createReadyUser('Console auth admin'));
	});

	test.afterAll(async () => {
		await cleanupUsers([admin.userId]);
	});

	test('a console page opened while signed out is shown after the login', async ({ page }) => {
		await page.goto(`${MEET_BASE_URL}/users`, { waitUntil: 'domcontentloaded' });
		await expectLoginPage(page);

		await performLogin(page, admin);

		await expect(page.locator('ov-users-lists')).toBeVisible({ timeout: 20_000 });
		await expect(page).toHaveURL(`${MEET_BASE_URL}/users`);
	});

	test('too many attempts show the throttling message instead of the invalid-credentials one', async ({ page }) => {
		await page.route('**/internal-api/v1/auth/login', (route) =>
			route.fulfill({
				status: 429,
				contentType: 'application/json',
				body: JSON.stringify({ error: 'Too Many Requests', message: 'Too many login attempts' })
			})
		);
		await page.goto(MEET_BASE_URL, { waitUntil: 'domcontentloaded' });
		await expectLoginPage(page);

		await performLogin(page, admin);

		await expect(page.locator('.login-error')).toHaveText('Too many login attempts. Please try again later');
		await expectLoginPage(page);
	});

	test('wrong credentials show the invalid-credentials message', async ({ page }) => {
		await page.goto(MEET_BASE_URL, { waitUntil: 'domcontentloaded' });
		await expectLoginPage(page);

		await performLogin(page, { userId: admin.userId, password: `${admin.password}x` });

		await expect(page.locator('.login-error')).toHaveText('Invalid user ID or password');
	});

	test('with every token expired a console page returns to the login and, after it, to that page', async ({
		page
	}) => {
		await authenticate(page, admin);
		const ctrl = await installTokenExpiryController(page);

		try {
			await gotoConsolePage(page, 'users', 'ov-users-lists');
			await ctrl.expireAccessToken();
			await ctrl.expireRefreshToken();

			await page.locator('#refresh-btn').click();

			await expectLoginPage(page);
			expect(ctrl.blockedCount()).toBeGreaterThan(0);

			await performLogin(page, admin);

			await expect(page.locator('ov-users-lists')).toBeVisible({ timeout: 20_000 });
			await expect(page).toHaveURL(`${MEET_BASE_URL}/users`);
		} finally {
			await ctrl.dispose();
		}
	});

	test('logging out from the toolbar calls the logout, discards the tokens and shows the login page', async ({
		page
	}) => {
		await authenticate(page, admin);
		await gotoConsolePage(page, 'users', 'ov-users-lists');
		const readStoredTokens = () =>
			page.evaluate(() => [
				localStorage.getItem('ovMeet-accessToken'),
				localStorage.getItem('ovMeet-refreshToken')
			]);
		expect((await readStoredTokens()).every(Boolean)).toBe(true);
		const logout = page.waitForRequest(
			(request) => request.method() === 'POST' && request.url().endsWith('/internal-api/v1/auth/logout')
		);

		await page.locator('#logout-btn').click();
		await logout;

		await expectLoginPage(page);
		expect((await readStoredTokens()).some(Boolean)).toBe(false);

		await page.goto(`${MEET_BASE_URL}/users`, { waitUntil: 'domcontentloaded' });
		await expectLoginPage(page);
		await expect(page.locator('ov-users-lists')).toHaveCount(0);
	});
});
