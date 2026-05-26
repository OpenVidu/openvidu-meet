import { expect, Page } from '@playwright/test';
import { iframeLocator } from './iframe.helper';

// ─── Screen sharing ─────────────────────────────────────────────────────────

/**
 * Starts screen sharing via the toolbar button.
 */
export const startScreensharing = async (page: Page): Promise<void> => {
	await iframeLocator(page, '#screenshare-btn').click();
};

/**
 * Stops screen sharing via the toolbar button and the disable-screen submenu.
 */
export const stopScreensharing = async (page: Page): Promise<void> => {
	await iframeLocator(page, '#screenshare-btn').click();
	await iframeLocator(page, '#disable-screen-button').click();
};

// ─── Virtual backgrounds ────────────────────────────────────────────────────

/**
 * Applies a virtual background effect by its ID.
 *
 * @param page - Playwright page.
 * @param backgroundId - The ID suffix of the effect button (e.g. `'2'`).
 */
export const applyBackgroundEffect = async (page: Page, backgroundId: string): Promise<void> => {
	await iframeLocator(page, '#more-options-btn').click();
	await iframeLocator(page, '#virtual-bg-btn').click();
	await expect(iframeLocator(page, 'ov-background-effects-panel')).toBeVisible();
	await iframeLocator(page, `#effect-${backgroundId}`).click();

	// Virtual-background processing is a GPU/canvas operation with no DOM signal.
	// Allow a brief settle window before screenshots/assertions.
	await page.waitForTimeout(1_500);
	await iframeLocator(page, '.panel-close-button').click();
	await expect(iframeLocator(page, 'ov-background-effects-panel')).toBeHidden();
};

/**
 * Removes any active virtual background.
 */
export const removeBackgroundEffect = async (page: Page): Promise<void> => {
	await iframeLocator(page, '#more-options-btn').click();
	await iframeLocator(page, '#virtual-bg-btn').click();
	await iframeLocator(page, '#no_effect-btn').click();
};
