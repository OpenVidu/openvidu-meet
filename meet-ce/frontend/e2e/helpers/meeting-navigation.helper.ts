import { expect, type Page } from '@playwright/test';
import { ensurePrejoinAudioState, ensurePrejoinVideoState } from './media-controls.helper';
import { click } from './ui-utils.helper';

// ─── Internal lobby / prejoin steps ─────────────────────────────────────────

/**
 * Fills the lobby form (participant name + optional E2EE key) and submits it.
 * Waits for the relevant inputs to be visible before interacting.
 */
const completeLobby = async (page: Page, options?: { name?: string; e2eeKey?: string }): Promise<void> => {
	const nameSubmit = page.locator('#participant-name-submit');
	const nameInput = page.locator('#participant-name-input');
	await expect(nameSubmit).toBeVisible({ timeout: 10_000 });
	await expect(nameInput).toBeVisible({ timeout: 10_000 });

	if (options?.name && (await nameInput.isEditable())) {
		await nameInput.fill(options.name);
	} else if (!(await nameInput.inputValue())) {
		await nameInput.fill(`pw-${Date.now()}`);
	}

	if (options?.e2eeKey) {
		const e2eeInput = page.locator('#participant-e2eekey-input');
		await expect(e2eeInput).toBeVisible({ timeout: 10_000 });
		await expect(e2eeInput).toBeEditable({ timeout: 10_000 });
		await e2eeInput.fill(options.e2eeKey);
	}

	await click(nameSubmit, 10_000);
};

/**
 * Clicks the join button in the prejoin screen after it becomes visible.
 */
const clickJoinRoom = async (page: Page): Promise<void> => {
	const joinButton = page.locator('#join-button');
	await expect(joinButton).toBeVisible({ timeout: 10_000 });
	await click(joinButton, 10_000);
};

// ─── Navigation entry-points ────────────────────────────────────────────────

/**
 * Navigates to the access URL, completes the lobby, clicks join, and waits for
 * the meeting layout to be fully loaded.
 *
 * @param options.name     - Participant display name (auto-generated when omitted).
 * @param options.e2eeKey  - End-to-end encryption passphrase.
 * @param options.videoEnabled - Whether the participant should have their video enabled at join.
 * @param options.audioEnabled - Whether the participant should have their audio enabled at join.
 * @param options.timeoutMs - Maximum wait time for each visibility assertion.
 */
export const openMeeting = async (
	page: Page,
	accessUrl: string,
	options?: {
		timeoutMs?: number;
		name?: string;
		e2eeKey?: string;
		videoEnabled?: boolean;
		audioEnabled?: boolean;
		/** Skip prejoin video/audio state checks (e.g. when media permissions are denied). */
		skipPrejoinMediaCheck?: boolean;
	}
): Promise<void> => {
	const {
		timeoutMs = 15_000,
		videoEnabled = true,
		audioEnabled = true,
		skipPrejoinMediaCheck = false
	} = options ?? {};

	await openPrejoin(page, accessUrl, options);

	if (!skipPrejoinMediaCheck) {
		await ensurePrejoinVideoState(page, videoEnabled);
		await ensurePrejoinAudioState(page, audioEnabled);
	}

	await clickJoinRoom(page);

	await expect(page.locator('#layout-container')).toBeVisible({ timeout: timeoutMs });
	await expect(page.locator('#media-buttons-container')).toBeVisible({ timeout: timeoutMs });
};

/**
 * Navigates to the access URL, completes the lobby, and stops at the prejoin
 * screen (camera / microphone preview) without joining the room.
 *
 * @param options.name     - Participant display name (auto-generated when omitted).
 * @param options.e2eeKey  - End-to-end encryption passphrase.
 * @param options.timeoutMs - Maximum wait time for each visibility assertion.
 */
export const openPrejoin = async (
	page: Page,
	accessUrl: string,
	options?: { timeoutMs?: number; name?: string; e2eeKey?: string }
): Promise<void> => {
	const timeoutMs = options?.timeoutMs ?? 15_000;

	await page.goto(accessUrl, { waitUntil: 'domcontentloaded' });
	await completeLobby(page, options);

	await expect(page.locator('#join-button')).toBeVisible({ timeout: timeoutMs });
};

/**
 * Navigates to the access URL and waits for the lobby name-input to appear,
 * without filling it or proceeding further.
 */
export const openLobby = async (page: Page, accessUrl: string, timeoutMs = 15_000): Promise<void> => {
	await page.goto(accessUrl, { waitUntil: 'domcontentloaded' });
	await expect(page.locator('#participant-name-input')).toBeVisible({ timeout: timeoutMs });
};

/**
 * Clicks the leave button (and the secondary confirmation if it appears) and
 * waits until the meeting layout is removed from the DOM.
 */
export const leaveMeeting = async (page: Page, timeoutMs = 10_000): Promise<void> => {
	await page.locator('#leave-btn').click();

	const leaveOption = page.locator('#leave-option');
	const leaveDropdownVisible = await leaveOption
		.waitFor({ state: 'visible', timeout: 1_000 })
		.then(() => true)
		.catch(() => false);

	if (leaveDropdownVisible) {
		await leaveOption.click();
	}

	await expect(page.locator('#layout-container')).toHaveCount(0, { timeout: timeoutMs });
};
