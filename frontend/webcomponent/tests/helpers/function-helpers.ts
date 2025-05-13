import { Page, Locator, FrameLocator } from '@playwright/test';

/**
 * Gets a FrameLocator for an iframe inside a Shadow DOM
 * @param page - Playwright page object
 * @param componentSelector - Selector for the web component with Shadow DOM
 * @param iframeSelector - Selector for the iframe within the Shadow DOM
 * @returns FrameLocator that can be used to access iframe contents
 */
export async function getIframeInShadowDom(
	page: Page,
	componentSelector: string = 'openvidu-meet',
	iframeSelector: string = 'iframe'
): Promise<FrameLocator> {
	// Verify the component exists
	await page.waitForSelector(componentSelector);

	// Use frameLocator to access the iframe contents
	return page.frameLocator(`${componentSelector} >>> ${iframeSelector}`);
}

/**
 * Waits for an element inside an iframe within Shadow DOM
 * @param page - Playwright page object
 * @param elementSelector - Selector for the element inside the iframe
 * @param options - Optional configuration
 * @returns Locator for the found element
 */
export async function waitForElementInIframe(
	page: Page,
	elementSelector: string,
	options: {
		componentSelector?: string;
		iframeSelector?: string;
		timeout?: number;
		state?: 'attached' | 'detached' | 'visible' | 'hidden';
	} = {}
): Promise<Locator> {
	const {
		componentSelector = 'openvidu-meet',
		iframeSelector = 'iframe',
		timeout = 30000,
		state = 'visible'
	} = options;

	// Get the iframe
	const frameLocator = await getIframeInShadowDom(page, componentSelector, iframeSelector);

	// Get element locator
	const elementLocator = frameLocator.locator(elementSelector);

	// Wait for the element with the specified state
	await elementLocator.waitFor({ state, timeout });

	return elementLocator;
}
