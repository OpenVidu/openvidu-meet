import { MeetUserRole } from '@openvidu-meet/typings';
import { expect, type Browser, type Page } from '@playwright/test';
import { createUser, getUserAccessToken, MEET_BASE_URL } from './meet-api.helper';
import { click } from './ui-utils.helper';

// Monotonic counter guaranteeing unique user ids even when users are created within the same
// millisecond (e.g. via Promise.all in a test's beforeAll).
let userSequence = 0;

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Credentials for logging a registered user into the OpenVidu Meet application.
 */
export interface LoginOptions {
	/** Registered user id. */
	userId: string;
	/** Current password. */
	password: string;
	/** New password of a user's first login, where the app forces a password change. */
	newPassword?: string;
}

/**
 * A user whose credentials are ready for a direct UI login (the mandatory first-login password
 * change has already been performed), so `password` logs in without a change-password step.
 */
export interface ReadyUser {
	userId: string;
	name: string;
	password: string;
}

const INITIAL_PASSWORD = 'changeme1';
const READY_PASSWORD = 'changed11';

// ─── Login steps ─────────────────────────────────────────────────────────────

const changePasswordOnFirstLogin = async (page: Page, currentPassword: string, newPassword: string): Promise<void> => {
	await page.locator('input[formcontrolname="currentPassword"]').fill(currentPassword);
	await page.locator('input[formcontrolname="newPassword"]').fill(newPassword);
	await page.locator('input[formcontrolname="confirmPassword"]').fill(newPassword);
	await click(page.locator('button[type="submit"].primary-button'), 10_000);
};

const submitLogin = async (page: Page, login: LoginOptions): Promise<void> => {
	await page.locator('#userId-input').fill(login.userId);
	await page.locator('#password-input').fill(login.password);
	await click(page.locator('#login-button'), 10_000);

	if (login.newPassword) {
		await changePasswordOnFirstLogin(page, login.password, login.newPassword);
	}
};

/**
 * Logs a registered user in when the app requests it. The login form is auto-detected (the app
 * shows it when authentication is required), so this is a no-op when no login is presented — for
 * example when the user is already authenticated or the room allows anonymous access. A login with
 * `newPassword` is a first login: the app forces the password change and this completes it.
 */
export const performLogin = async (page: Page, login: LoginOptions): Promise<void> => {
	const loginRequired = await page
		.locator('#login-button')
		.waitFor({ state: 'visible', timeout: 5_000 })
		.then(() => true)
		.catch(() => false);

	if (loginRequired) {
		await submitLogin(page, login);
	}
};

/**
 * Establishes an authenticated session by logging in from the OpenVidu Meet home page. A fresh page
 * always gets the login form there, so it waits for it however long the app takes to start.
 */
export const authenticate = async (page: Page, login: LoginOptions): Promise<void> => {
	await page.goto(MEET_BASE_URL, { waitUntil: 'domcontentloaded' });
	await expect(page.locator('#login-button')).toBeVisible({ timeout: 20_000 });
	await submitLogin(page, login);
	await expect(page.locator('#login-button')).toHaveCount(0, { timeout: 15_000 });
};

/** Opens a page in a browser context of its own, signed in as the given user. */
export const openSignedInPage = async (browser: Browser, login: LoginOptions): Promise<Page> => {
	const page = await (await browser.newContext()).newPage();
	await authenticate(page, login);
	return page;
};

// ─── Login-page assertions ─────────────────────────────────────────────────────

/**
 * Asserts that no login page is presented (the target page is reached directly).
 */
export const expectNoLoginPage = async (page: Page): Promise<void> => {
	await expect(page.locator('#login-button')).toHaveCount(0);
};

/**
 * Asserts that the login page is presented (login is required to proceed).
 */
export const expectLoginPage = async (page: Page): Promise<void> => {
	await expect(page.locator('#login-button')).toBeVisible({ timeout: 10_000 });
};

// ─── User creation ──────────────────────────────────────────────────────────────

/**
 * Creates a user ready for a UI login and returns it together with a usable access token: the
 * mandatory first-login password change is performed up front (via the API), so the returned user's
 * `password` logs in directly without a change-password step. Defaults to an admin, who always has
 * room/recording access regardless of the room's user-access setting.
 */
export const createReadyUser = async (
	name: string,
	role: MeetUserRole = MeetUserRole.ADMIN
): Promise<{ user: ReadyUser; accessToken: string }> => {
	const userId = `user${Date.now()}_${userSequence++}`;
	await createUser({ userId, name, role, password: INITIAL_PASSWORD });
	const accessToken = await getUserAccessToken(userId, INITIAL_PASSWORD, READY_PASSWORD);
	return { user: { userId, name, password: READY_PASSWORD }, accessToken };
};
