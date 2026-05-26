import type { Locator, Page } from '@playwright/test';

export const getCaptionsButton = (page: Page): Locator => {
	return page.locator('#captions-button').first();
};

export const getCaptionsButtonIcon = (page: Page): Locator => {
	return page.locator('#captions-button mat-icon').first();
};
