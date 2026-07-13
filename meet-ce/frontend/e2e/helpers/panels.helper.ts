import { expect, type Page } from '@playwright/test';
import { click, expectHidden } from './ui-utils.helper';

// ─── More-options menu ──────────────────────────────────────────────────────

/**
 * Opens the "more options" toolbar menu and waits for its content to appear.
 */
export const openMoreOptionsMenu = async (page: Page): Promise<void> => {
	const moreOptionsButton = page.locator('#more-options-btn');
	await expect(moreOptionsButton).toBeVisible();
	await click(moreOptionsButton, 10_000);
	await expect(page.locator('.mat-mdc-menu-content')).toBeVisible();
};

// ─── Participants panel ─────────────────────────────────────────────────────

/**
 * Toggles the participants side-panel open/closed.
 */
export const toggleParticipantsPanel = async (page: Page): Promise<void> => {
	await page.locator('#participants-panel-btn').click();
};

// ─── Activities panel ───────────────────────────────────────────────────────

/**
 * Toggles the activities side-panel open/closed.
 */
export const toggleActivitiesPanel = async (page: Page): Promise<void> => {
	await page.locator('#activities-panel-btn').click();
};

// ─── Settings panel ─────────────────────────────────────────────────────────

/**
 * Opens the settings panel from the more-options menu and waits for the
 * sidenav to be visible.
 */
export const openSettingsPanel = async (page: Page): Promise<void> => {
	await openMoreOptionsMenu(page);
	await page.locator('#toolbar-settings-btn').click();
	await expect(page.locator('.sidenav-menu')).toBeVisible();
};

/**
 * Opens the grid-layout settings panel from the more-options menu.
 */
export const openLayoutSettingsPanel = async (page: Page): Promise<void> => {
	await openMoreOptionsMenu(page);
	const gridLayoutSettingsButton = page.locator('#grid-layout-settings-btn');
	await expect(gridLayoutSettingsButton).toBeVisible();
	await click(gridLayoutSettingsButton, 5_000);
	await expect(page.locator('#settings-container')).toBeVisible();
};

/**
 * Closes the currently-open settings panel.
 */
export const closeSettingsPanel = async (page: Page): Promise<void> => {
	await page.locator('.panel-close-button').click();
	await expectHidden(page, '#settings-container');
};
