import { expect, type Page } from '@playwright/test';
import { openMoreOptionsMenu } from './panels.helper';
import { clickControlButton, hoverStream } from './ui-utils.helper';

// ─── Prejoin media toggles ──────────────────────────────────────────────────

/**
 * Toggles the camera button on the prejoin screen.
 */
export const togglePrejoinCamera = async (page: Page, timeoutMs = 10_000): Promise<void> => {
	await clickControlButton(page, '#camera-button', timeoutMs);
};

/**
 * Toggles the microphone button on the prejoin screen.
 */
export const togglePrejoinMicrophone = async (page: Page, timeoutMs = 10_000): Promise<void> => {
	await clickControlButton(page, '#microphone-button', timeoutMs);
};

/**
 * Returns `true` when the prejoin camera button is in the "enabled" state.
 */
export const isPrejoinVideoEnabled = async (page: Page): Promise<boolean> => {
	const cameraButton = page.locator('#camera-button');
	await expect(cameraButton).toBeVisible({ timeout: 10_000 });
	return await cameraButton.evaluate((el) => el.classList.contains('device-enabled'));
};

/**
 * Returns `true` when the prejoin microphone button is in the "enabled" state.
 */
export const isPrejoinAudioEnabled = async (page: Page): Promise<boolean> => {
	const microphoneButton = page.locator('#microphone-button');
	await expect(microphoneButton).toBeVisible({ timeout: 10_000 });
	return await microphoneButton.evaluate((el) => el.classList.contains('device-enabled'));
};

/**
 * Ensures the prejoin camera matches the desired state, toggling if needed.
 */
export const ensurePrejoinVideoState = async (page: Page, enabled: boolean, timeoutMs = 10_000): Promise<void> => {
	const currentlyEnabled = await isPrejoinVideoEnabled(page);

	if (currentlyEnabled !== enabled) {
		await togglePrejoinCamera(page);
		await expect
			.poll(async () => (await isPrejoinVideoEnabled(page)) !== currentlyEnabled, { timeout: timeoutMs })
			.toBeTruthy()
			.catch(() => Promise.resolve());
	}
};

/**
 * Ensures the prejoin microphone matches the desired state, toggling if needed.
 */
export const ensurePrejoinAudioState = async (page: Page, enabled: boolean, timeoutMs = 10_000): Promise<void> => {
	const currentlyEnabled = await isPrejoinAudioEnabled(page);

	if (currentlyEnabled !== enabled) {
		await togglePrejoinMicrophone(page);
		await expect
			.poll(async () => (await isPrejoinAudioEnabled(page)) !== currentlyEnabled, { timeout: timeoutMs })
			.toBeTruthy()
			.catch(() => Promise.resolve());
	}
};

// ─── In-meeting media toggles ───────────────────────────────────────────────

/**
 * Toggles the in-meeting camera button.
 */
export const toggleCamera = async (page: Page): Promise<void> => {
	await clickControlButton(page, '#camera-btn');
};

/**
 * Toggles the in-meeting microphone button.
 */
export const toggleMicrophone = async (page: Page): Promise<void> => {
	await clickControlButton(page, '#mic-btn');
};

// ─── Screen sharing ─────────────────────────────────────────────────────────

/**
 * Clicks the screen-share toolbar button to start sharing.
 */
export const startScreensharing = async (page: Page, timeoutMs = 10_000): Promise<void> => {
	await page.locator('#screenshare-btn').click();
	await expect(page.locator('.OV_screen .local')).toBeVisible({ timeout: timeoutMs });
};

/**
 * Stops screen sharing by clicking the toolbar button and the secondary
 * disable button, then waits until the local screen stream is gone.
 */
export const stopScreensharing = async (page: Page, timeoutMs = 10_000): Promise<void> => {
	await page.locator('#screenshare-btn').click();
	await page.locator('#disable-screen-button').click();
	await expect(page.locator('.OV_screen .local')).toHaveCount(0, { timeout: timeoutMs });
};

// ─── Remote participant mute ────────────────────────────────────────────────

/**
 * Hovers over a remote stream and toggles its mute button.
 */
const toggleRemoteParticipantMute = async (page: Page, remoteStreamSelector = '.OV_stream.remote'): Promise<void> => {
	await hoverStream(page, remoteStreamSelector);
	const muteButton = page.locator(`${remoteStreamSelector} #mute-btn`).first();
	await expect(muteButton).toBeVisible();
	await muteButton.click();
};

/**
 * Mutes a remote participant's audio from the local UI.
 */
export const muteRemoteParticipant = async (page: Page, remoteStreamSelector = '.OV_stream.remote'): Promise<void> => {
	await toggleRemoteParticipantMute(page, remoteStreamSelector);
};

/**
 * Un-mutes a remote participant's audio from the local UI.
 */
export const unmuteRemoteParticipant = async (
	page: Page,
	remoteStreamSelector = '.OV_stream.remote'
): Promise<void> => {
	await toggleRemoteParticipantMute(page, remoteStreamSelector);
};

// ─── Virtual backgrounds ────────────────────────────────────────────────────

/**
 * Opens the virtual-backgrounds panel from the prejoin screen.
 */
export const openPrejoinBackgroundsPanel = async (page: Page): Promise<void> => {
	await page.locator('#backgrounds-button').click();
	await expect(page.locator('#background-effects-container')).toBeVisible();
};

/**
 * Closes the virtual-backgrounds panel on the prejoin screen.
 * Uses the panel's internal close button to avoid toggling issues: if the panel
 * was briefly auto-closed (e.g. during background-effect processing), clicking
 * the toggle #backgrounds-button would re-open it instead of leaving it closed.
 */
export const closePrejoinBackgroundsPanel = async (page: Page): Promise<void> => {
	const panel = page.locator('#background-effects-container');
	await expect(panel).toBeVisible({ timeout: 5000 });
	await panel.locator('.panel-close-button').click();
	await expect(panel).toHaveCount(0, { timeout: 5000 });
};

/**
 * Opens the virtual-backgrounds panel from the in-meeting more-options menu.
 */
export const openRoomBackgroundsPanel = async (page: Page): Promise<void> => {
	await openMoreOptionsMenu(page);
	await page.locator('#virtual-bg-btn:visible').click();
	await expect(page.locator('#background-effects-container')).toBeVisible();
};

/**
 * Closes the virtual-backgrounds panel from the in-meeting more-options menu.
 */
export const closeRoomBackgroundsPanel = async (page: Page): Promise<void> => {
	await openMoreOptionsMenu(page);
	await page.locator('#virtual-bg-btn:visible').click();
	await expect(page.locator('#background-effects-container')).toHaveCount(0);
};

/**
 * Applies a background effect by its id
 */
export const applyBackgroundEffect = async (page: Page, effectId: string, timeoutMs = 10_000): Promise<void> => {
	await expect(page.locator('.OV_media-element.camera-source')).toBeVisible({ timeout: timeoutMs });
	await page.locator(`#effect-${effectId}`).click();
};

// ─── Device selector ─────────────────────────────────────────────────────────

/**
 * Asserts that at least one video device option is visible in the device selector.
 */
export const assertHasVideoDeviceOption = async (page: Page): Promise<void> => {
	await expect(page.locator('[id^="option-"]').first()).toBeVisible();
};

/**
 * Opens the video device dropdown (prejoin compact selector or settings panel) and returns each
 * device option's `label` and whether it is currently `selected`. The selected flag comes from the
 * menu item's `selected` class, which the component keys on the device id — the correct identity to
 * reason about, since a device's display label and its track label/deviceId need not match.
 *
 * Returns `[]` when the dropdown is not openable (e.g. disabled).
 */
export const getVideoDeviceOptions = async (page: Page): Promise<Array<{ label: string; selected: boolean }>> => {
	const dropdown = page.locator('#video-dropdown');
	await expect(dropdown).toBeVisible({ timeout: 10_000 });

	if (await dropdown.isDisabled()) {
		return [];
	}

	await dropdown.click();
	const options = page.locator('[id^="option-"]');
	await expect(options.first()).toBeVisible({ timeout: 10_000 });
	return options.evaluateAll((elements) =>
		elements.map((el) => ({
			label: el.id.replace(/^option-/, ''),
			selected: el.classList.contains('selected')
		}))
	);
};

/**
 * Selects a video device option by its label, opening the dropdown first when the option is not
 * already visible.
 */
export const selectVideoDevice = async (page: Page, label: string): Promise<void> => {
	const option = page.locator(`#option-${label}`);

	if (!(await option.isVisible())) {
		await clickControlButton(page, '#video-dropdown');
	}

	await expect(option).toBeVisible({ timeout: 10_000 });
	await option.click();
};
