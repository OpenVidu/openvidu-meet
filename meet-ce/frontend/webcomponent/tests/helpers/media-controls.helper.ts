import { expect, Page } from '@playwright/test';
import { wcLocator } from './webcomponent.helper';

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
