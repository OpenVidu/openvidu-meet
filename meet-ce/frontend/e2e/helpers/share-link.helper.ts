import { type Page } from '@playwright/test';
import { expectHidden, expectVisible } from './ui-utils.helper';

/**
 * Asserts that sharing access links is available (`canShareAccessLinks` granted): the toolbar
 * copy-link button is shown. This is the definitive permission gate (`showShareAccessLinks` in a
 * non-embedded app); the other share points (layout overlay, invite panel) are covered by the
 * dedicated share-link suite.
 */
export const expectShareAccessLinkAvailable = async (page: Page): Promise<void> => {
	await expectVisible(page, '#copy-speaker-link');
};

/**
 * Asserts that sharing access links is not available (`canShareAccessLinks` denied): neither the
 * toolbar copy-link button nor the layout share overlay is shown.
 */
export const expectNoShareAccessLink = async (page: Page): Promise<void> => {
	await expectHidden(page, '#copy-speaker-link');
	await expectHidden(page, '#share-link-overlay');
};
