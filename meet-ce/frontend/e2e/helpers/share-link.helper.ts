import { type Page } from '@playwright/test';
import { expectHidden, expectVisible } from './ui-utils.helper';

/**
 * Asserts that sharing access links is available (`canShareAccessLinks` granted): the toolbar
 * copy-link button is shown.
 */
export const expectShareAccessLinkAvailable = async (page: Page): Promise<void> => {
	await expectVisible(page, '#copy-speaker-link');
};

/**
 * Asserts that sharing access links is not available (`canShareAccessLinks` denied): the
 * toolbar copy-link button is not shown.
 */
export const expectNoShareAccessLink = async (page: Page): Promise<void> => {
	await expectHidden(page, '#copy-speaker-link');
};
