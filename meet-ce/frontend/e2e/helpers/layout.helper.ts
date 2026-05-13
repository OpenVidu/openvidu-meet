import { expect, type Page } from '@playwright/test';

/**
 * Sets the Smart Mosaic participant count slider to a specific value
 * @param page - Playwright page object
 * @param targetValue - Target participant count (1-6)
 */
export const setSmartMosaicSliderValue = async (page: Page, targetValue: number): Promise<void> => {
	const sliderInput = page.locator('.participant-slider input[matSliderThumb]');
	await expect(sliderInput).toBeVisible();
	await sliderInput.focus();
	await sliderInput.fill(targetValue.toString());
	await expect(page.locator('.participant-count-value')).toHaveText(String(targetValue), { timeout: 5_000 });
}

/**
 * Selects the mosaic layout radio button
 */
export const selectMosaicLayout = async (page: Page): Promise<void> => {
	await page.locator('#layout-mosaic').click();
}

/**
 * Selects the smart mosaic layout radio button
 */
export const selectSmartMosaicLayout = async (page: Page): Promise<void> => {
	await page.locator('#layout-smart-mosaic').click();
}
