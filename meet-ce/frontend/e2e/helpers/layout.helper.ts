import { expect, type Page } from '@playwright/test';

/**
 * Opens the layout settings panel by clicking more-options and grid-layout-settings buttons
 */
export async function openLayoutSettingsPanel(page: Page): Promise<void> {
	await page.locator('#more-options-btn').click();
	await expect(page.locator('#grid-layout-settings-btn')).toBeVisible();
	await page.locator('#grid-layout-settings-btn').click();
	await expect(page.locator('#settings-container')).toBeVisible();
}

/**
 * Sets the Smart Mosaic participant count slider to a specific value
 * @param page - Playwright page object
 * @param targetValue - Target participant count (1-6)
 */
export async function setSmartMosaicSliderValue(page: Page, targetValue: number): Promise<void> {
	const sliderInput = page.locator('.participant-slider input[matSliderThumb]');
	await expect(sliderInput).toBeVisible();
	await sliderInput.focus();
	await sliderInput.fill(targetValue.toString());
	await expect(page.locator('.participant-count-value')).toHaveText(String(targetValue), { timeout: 5_000 });
}

/**
 * Selects the mosaic layout radio button
 */
export async function selectMosaicLayout(page: Page): Promise<void> {
	await page.locator('#layout-mosaic').click();
}

/**
 * Selects the smart mosaic layout radio button
 */
export async function selectSmartMosaicLayout(page: Page): Promise<void> {
	await page.locator('#layout-smart-mosaic').click();
}
