import { expect, Locator, Page } from '@playwright/test';
import { Integration, meetLocator, wcLocator } from './webcomponent.helper';

// ─── Local media state (mic/camera) ────────────────────────────────────────
//
// Both the prejoin (media-setup) screen and the in-meeting toolbar bind their
// mic/camera button's enabled/disabled class straight off the participant's
// real device state (`isMicrophoneEnabled()`/`isCameraEnabled()` computed
// independently per screen) — reading it is a ground-truth check that the
// device is actually on or off, independent of any internal bookkeeping.
// ─────────────────────────────────────────────────────────────────────────────

/** The prejoin (media-setup) mic toggle button — `device-enabled`/`device-disabled` class. */
export const prejoinMicButton = (page: Page, integration: Integration): Locator =>
	meetLocator(page, integration, '#microphone-button');

/** The prejoin (media-setup) camera toggle button — `device-enabled`/`device-disabled` class. */
export const prejoinCameraButton = (page: Page, integration: Integration): Locator =>
	meetLocator(page, integration, '#camera-button');

/** The in-meeting toolbar mic button — `disabled` class when muted. */
export const toolbarMicButton = (page: Page, integration: Integration): Locator =>
	meetLocator(page, integration, '#mic-btn');

/** The in-meeting toolbar camera button — `disabled` class when off. */
export const toolbarCameraButton = (page: Page, integration: Integration): Locator =>
	meetLocator(page, integration, '#camera-btn');

/** Asserts the prejoin mic button reflects `enabled` (`device-enabled` vs. `device-disabled`). */
export const expectPrejoinMicEnabled = async (
	page: Page,
	integration: Integration,
	enabled: boolean,
	options: { timeout?: number } = {}
): Promise<void> => {
	const button = prejoinMicButton(page, integration);
	await expect(button).toHaveClass(enabled ? /device-enabled/ : /device-disabled/, options);
};

/** Asserts the prejoin camera button reflects `enabled` (`device-enabled` vs. `device-disabled`). */
export const expectPrejoinCameraEnabled = async (
	page: Page,
	integration: Integration,
	enabled: boolean,
	options: { timeout?: number } = {}
): Promise<void> => {
	const button = prejoinCameraButton(page, integration);
	await expect(button).toHaveClass(enabled ? /device-enabled/ : /device-disabled/, options);
};

/**
 * Asserts the in-meeting toolbar mic button reflects `enabled` (the `.disabled` visual class,
 * distinct from the HTML `disabled` attribute the button also carries when there is no device).
 */
export const expectToolbarMicEnabled = async (
	page: Page,
	integration: Integration,
	enabled: boolean,
	options: { timeout?: number } = {}
): Promise<void> => {
	const button = toolbarMicButton(page, integration);
	await (enabled ? expect(button).not.toHaveClass(/disabled/, options) : expect(button).toHaveClass(/disabled/, options));
};

/** Asserts the in-meeting toolbar camera button reflects `enabled` (see {@link expectToolbarMicEnabled}). */
export const expectToolbarCameraEnabled = async (
	page: Page,
	integration: Integration,
	enabled: boolean,
	options: { timeout?: number } = {}
): Promise<void> => {
	const button = toolbarCameraButton(page, integration);
	await (enabled ? expect(button).not.toHaveClass(/disabled/, options) : expect(button).toHaveClass(/disabled/, options));
};

// ─── Screen sharing ─────────────────────────────────────────────────────────

/**
 * Starts screen sharing via the toolbar button.
 */
export const startScreensharing = async (page: Page): Promise<void> => {
	await wcLocator(page, '#screenshare-btn').click();
};

/**
 * Stops screen sharing via the toolbar button and the disable-screen submenu.
 */
export const stopScreensharing = async (page: Page): Promise<void> => {
	await wcLocator(page, '#screenshare-btn').click();
	await wcLocator(page, '#disable-screen-button').click();
};

// ─── Virtual backgrounds ────────────────────────────────────────────────────

/**
 * Applies a virtual background effect by its ID.
 *
 * @param page - Playwright page.
 * @param backgroundId - The ID suffix of the effect button (e.g. `'2'`).
 */
export const applyBackgroundEffect = async (page: Page, backgroundId: string): Promise<void> => {
	await wcLocator(page, '#more-options-btn').click();
	await wcLocator(page, '#virtual-bg-btn').click();
	await expect(wcLocator(page, 'ov-background-effects-panel')).toBeVisible();
	await wcLocator(page, `#effect-${backgroundId}`).click();

	// Virtual-background processing is a GPU/canvas operation with no DOM signal.
	// Allow a brief settle window before screenshots/assertions.
	await page.waitForTimeout(1_500);
	await wcLocator(page, '.panel-close-button').click();
	await expect(wcLocator(page, 'ov-background-effects-panel')).toBeHidden();
};

/**
 * Removes any active virtual background.
 */
export const removeBackgroundEffect = async (page: Page): Promise<void> => {
	await wcLocator(page, '#more-options-btn').click();
	await wcLocator(page, '#virtual-bg-btn').click();
	await wcLocator(page, '#no_effect-btn').click();
};
