import { expect, Page } from '@playwright/test';
import { iframeLocator } from './iframe.helper';

// ─── Menu & panel helpers ───────────────────────────────────────────────────

/**
 * Opens the "more options" overflow menu in the toolbar.
 */
export const openMoreOptionsMenu = async (page: Page): Promise<void> => {
	await expect(iframeLocator(page, '#toolbar')).toBeVisible();
	await iframeLocator(page, '#more-options-btn').click();
	await expect(iframeLocator(page, '.mat-mdc-menu-content')).toBeVisible();
};
