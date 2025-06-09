import { Page, Locator, FrameLocator } from '@playwright/test';
import { expect } from '@playwright/test';

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

// Interacti with an element inside an iframe within Shadow DOM
export async function interactWithElementInIframe(
	page: Page,
	elementSelector: string,
	options: {
		action: 'click' | 'fill' | 'type';
		value?: string; // Only needed for 'fill' or 'type' actions
		timeout?: number;
	} = {
		action: 'click',
		value: '',
		timeout: 30000
	}
): Promise<void> {
	const { action, value = '', timeout = 30000 } = options;
	const element = await waitForElementInIframe(page, elementSelector);
	// Perform the specified action
	switch (action) {
		case 'click':
			await element.click();
			break;
		case 'fill':
			await element.fill(value);
			break;
		default:
			throw new Error(`Unsupported action: ${action}`);
	}
}

export const prepareForJoiningRoom = async (page: Page, url: string, roomPrefix: string) => {
	await page.goto(url);
	await page.waitForSelector('.rooms-container');
	await page.waitForSelector(`#${roomPrefix}`);
	await page.click('.dropdown-button');
	await page.waitForSelector('#join-as-moderator');
	await page.waitForSelector('#join-as-publisher');
};

export const joinRoomAs = async (role: 'moderator' | 'publisher', pName: string, page: Page) => {
	await page.click('#join-as-' + role);
	const component = page.locator('openvidu-meet');
	await expect(component).toBeVisible();

	// Wait for participant name input and fill it
	await waitForElementInIframe(page, '#participant-name-input', { state: 'visible' });
	await interactWithElementInIframe(page, '#participant-name-input', {
		action: 'fill',
		value: pName
	});
	await interactWithElementInIframe(page, '#participant-name-submit', { action: 'click' });

	// wait for prejoin page to load and join the room
	await waitForElementInIframe(page, 'ov-pre-join', { state: 'visible' });
	await interactWithElementInIframe(page, '#join-button', { action: 'click' });
};

export const leaveRoom = async (page: Page) => {
	const button = await waitForElementInIframe(page, '#leave-btn');
	await button.click();
	await page.waitForSelector('.event-LEFT');
};

export const startScreenSharing = async (page: Page) => {
	await interactWithElementInIframe(page, '#screenshare-btn', { action: 'click' });
	await waitForElementInIframe(page, '#local-element-screen_share', { state: 'visible' });
};

export const stopScreenSharing = async (page: Page) => {
	await interactWithElementInIframe(page, '#screenshare-btn', { action: 'click' });
	await page.waitForTimeout(200); // Wait for screen menu
	await interactWithElementInIframe(page, '#disable-screen-button', { action: 'click' });
	await page.waitForTimeout(500); // Wait for screen to stop sharing
};

export const applyVirtualBackground = async (page: Page, backgroundId: string) => {
	await interactWithElementInIframe(page, '#more-options-btn', { action: 'click' });
	await page.waitForTimeout(500);
	await interactWithElementInIframe(page, '#virtual-bg-btn', { action: 'click' });
	await waitForElementInIframe(page, 'ov-background-effects-panel', { state: 'visible' });
	await interactWithElementInIframe(page, `#effect-${backgroundId}`, { action: 'click' });
	await interactWithElementInIframe(page, '.panel-close-button', { action: 'click' });
};

export const removeVirtualBackground = async (page: Page) => {
	await interactWithElementInIframe(page, '#more-options-btn', { action: 'click' });
	await page.waitForTimeout(500);
	await interactWithElementInIframe(page, '#virtual-bg-btn', { action: 'click' });
	await interactWithElementInIframe(page, '#no_effect-btn', { action: 'click' });
	await page.waitForTimeout(500); // Wait for background to be removed
};
export const saveScreenshot = async (page: Page, filename: string, selector: string) => {
	const element = await waitForElementInIframe(page, selector);
	await element.screenshot({ path: filename });
};
