import { expect, Page } from '@playwright/test';
import { wcLocator } from './webcomponent.helper';

// ─── Menu & panel helpers ───────────────────────────────────────────────────

/**
 * Opens the "more options" overflow menu in the toolbar.
 */
export const openMoreOptionsMenu = async (page: Page): Promise<void> => {
	await expect(wcLocator(page, '#toolbar')).toBeVisible();
	await wcLocator(page, '#more-options-btn').click();
	await expect(wcLocator(page, '.mat-mdc-menu-content')).toBeVisible();
};
