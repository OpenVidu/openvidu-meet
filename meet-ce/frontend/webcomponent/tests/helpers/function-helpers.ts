import { expect, FrameLocator, Locator, Page } from '@playwright/test';
import * as fs from 'fs';
import { PNG } from 'pngjs';
import { MeetRecordingAccess, MeetRoomConfig } from '../../../../typings/src/room-config';
import { MEET_API_KEY, MEET_API_URL, MEET_TESTAPP_URL } from '../config';

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
 * Waits for one or more elements inside an iframe within a Shadow DOM.
 *
 * By default, waits for the first matching element.
 * If `options.all` is set to `true`, waits for all matching elements and returns an array.
 *
 * @param page - Playwright `Page` instance.
 * @param elementSelector - CSS selector for the target element(s) inside the iframe.
 * @param options - Optional configuration object.
 * @param options.componentSelector - Selector for the shadow DOM component that contains the iframe. Defaults to `'openvidu-meet'`.
 * @param options.iframeSelector - Selector for the iframe inside the shadow DOM. Defaults to `'iframe'`.
 * @param options.timeout - Maximum time in milliseconds to wait. Defaults to `30000`.
 * @param options.state - Wait condition: `'attached' | 'detached' | 'visible' | 'hidden'`. Defaults to `'visible'`.
 * @param options.index - Element index to return when multiple elements match. Defaults to `0`.
 * @param options.all - If `true`, waits for all matching elements and returns an array of locators. Defaults to `false`.
 *
 * @returns A single `Locator` by default, or an array of `Locator[]` when `options.all` is `true`.
 *
 * @example
 * // Wait for the first visible element
 * const element = await waitForElementInIframe(page, '.participant');
 *
 * @example
 * // Wait for all visible elements
 * const elements = await waitForElementInIframe(page, '.participant', { all: true });
 */
export async function waitForElementInIframe(
	page: Page,
	elementSelector: string,
	options?: {
		componentSelector?: string;
		iframeSelector?: string;
		timeout?: number;
		state?: 'attached' | 'detached' | 'visible' | 'hidden';
		index?: number;
		all?: false;
	}
): Promise<Locator>;
export async function waitForElementInIframe(
	page: Page,
	elementSelector: string,
	options: {
		componentSelector?: string;
		iframeSelector?: string;
		timeout?: number;
		state?: 'attached' | 'detached' | 'visible' | 'hidden';
		all: true;
	}
): Promise<Locator[]>;
export async function waitForElementInIframe(
	page: Page,
	elementSelector: string,
	options: {
		componentSelector?: string;
		iframeSelector?: string;
		timeout?: number;
		state?: 'attached' | 'detached' | 'visible' | 'hidden';
		index?: number;
		all?: boolean;
	} = {}
): Promise<Locator | Locator[]> {
	const {
		componentSelector = 'openvidu-meet',
		iframeSelector = 'iframe',
		timeout = 30000,
		state = 'visible',
		index = 0,
		all = false
	} = options;

	const frameLocator = await getIframeInShadowDom(page, componentSelector, iframeSelector);
	const baseLocator = frameLocator.locator(elementSelector);

	if (all) {
		const locators = await baseLocator.all();
		await Promise.all(locators.map((l) => l.waitFor({ state, timeout })));
		return locators;
	}

	const target = baseLocator.nth(index);
	await target.waitFor({ state, timeout });
	return target;
}

export async function countElementsInIframe(
	page: Page,
	elementSelector: string,
	options: {
		componentSelector?: string;
		iframeSelector?: string;
		timeout?: number;
		state?: 'attached' | 'visible';
	} = {}
): Promise<number> {
	const { componentSelector = 'openvidu-meet', iframeSelector = 'iframe' } = options;

	const frameLocator = await getIframeInShadowDom(page, componentSelector, iframeSelector);
	const elements = frameLocator.locator(elementSelector);

	return await elements.count();
}

// Interact with an element inside an iframe within Shadow DOM
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
	const element = await waitForElementInIframe(page, elementSelector, { timeout });

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

// Helper function to get default room config
const getDefaultRoomConfig = (): MeetRoomConfig => ({
	recording: {
		enabled: true,
		allowAccessTo: MeetRecordingAccess.ADMIN_MODERATOR_SPEAKER
	},
	chat: { enabled: true },
	virtualBackground: { enabled: true }
});

// Helper function to create a room for testing
export const createTestRoom = async (roomName: string, config: MeetRoomConfig = getDefaultRoomConfig()) => {
	const response = await fetch(`${MEET_API_URL}/api/v1/rooms`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'x-api-key': MEET_API_KEY
		},
		body: JSON.stringify({
			roomName,
			autoDeletionDate: new Date(Date.now() + 61 * 60 * 1000).getTime(), // 1 hour from now
			config
		})
	});

	if (!response.ok) {
		const errorResponse = await response.json();
		console.error('Error creating room:', errorResponse);
		throw new Error(`Failed to create room: ${response.status}`);
	}

	const room = await response.json();
	return room.roomId;
};

// Helper function to update room config via REST API
export const updateRoomConfig = async (roomId: string, config: any) => {
	const response = await fetch(`${MEET_API_URL}/api/v1/rooms/${roomId}/config`, {
		method: 'PUT',
		headers: {
			'Content-Type': 'application/json',
			'x-api-key': MEET_API_KEY
		},
		body: JSON.stringify({ config })
	});

	if (!response.ok) {
		throw new Error(`Failed to update room config: ${response.status} ${await response.text()}`);
	}

	return response.json();
};

// Helper function to delete a room
export const deleteTestRoom = async (roomId: string) => {
	await fetch(`${MEET_API_URL}/api/v1/rooms/${roomId}`, {
		method: 'DELETE',
		headers: {
			'x-api-key': MEET_API_KEY
		}
	});
};

export const deleteAllRecordings = async (page: Page) => {
	await page.goto(MEET_TESTAPP_URL);
	await page.waitForSelector('#delete-all-recordings-btn', { state: 'visible' });
	await page.click('#delete-all-recordings-btn');
};

export const deleteAllRooms = async (page: Page) => {
	await page.goto(MEET_TESTAPP_URL);
	await page.waitForSelector('#delete-all-rooms-btn', { state: 'visible' });
	await page.click('#delete-all-rooms-btn');
};

export const startStopRecording = async (page: Page, action: 'start' | 'stop') => {
	const buttonSelector = action === 'start' ? '#recording-btn' : '#stop-recording-btn';
	if (action === 'start') {
		await openMoreOptionsMenu(page);
	}

	await waitForElementInIframe(page, buttonSelector, { state: 'visible' });
	await interactWithElementInIframe(page, buttonSelector, { action: 'click' });
	await page.waitForTimeout(500); // Wait for recording action to complete

	if (action === 'start') {
		await page.waitForSelector('.webhook-recordingUpdated', { timeout: 10000 });
	}
	if (action === 'stop') {
		await page.waitForSelector('.webhook-recordingEnded', { timeout: 10000 });
	}
};

export const prepareForJoiningRoom = async (page: Page, url: string, roomId: string) => {
	await page.goto(url);
	await page.waitForSelector('.rooms-container');
	await page.waitForSelector(`#${roomId}`);
	await page.click('.dropdown-button');
	await page.waitForSelector('#join-as-moderator');
	await page.waitForSelector('#join-as-speaker');
};

export const joinRoomAs = async (role: 'moderator' | 'speaker', pName: string, page: Page) => {
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
	await waitForElementInIframe(page, 'ov-session', { state: 'visible' });
};

export const accessRoomAs = async (role: 'moderator' | 'speaker', page: Page) => {
	await page.click('#join-as-' + role);
	const component = page.locator('openvidu-meet');
	await expect(component).toBeVisible();
};

export const viewRecordingsAs = async (role: 'moderator' | 'speaker', page: Page) => {
	await page.click('#join-as-' + role);
	const component = page.locator('openvidu-meet');
	await expect(component).toBeVisible();

	await interactWithElementInIframe(page, '#view-recordings-btn', { action: 'click' });
};

export const leaveRoom = async (page: Page, role: 'moderator' | 'speaker' = 'speaker') => {
	await interactWithElementInIframe(page, '#leave-btn', { action: 'click' });

	if (role === 'moderator') {
		await page.waitForTimeout(500); // Wait for leave animation
		await interactWithElementInIframe(page, '#leave-option', { action: 'click' });
	}

	await page.waitForSelector('.event-left');
	await page.waitForSelector('.webhook-meetingEnded', { timeout: 10000 });
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
	await page.waitForTimeout(2000); // Allow background processing time
	await interactWithElementInIframe(page, '.panel-close-button', { action: 'click' });
	await page.waitForTimeout(1000); // Wait panel to close
};

export const removeVirtualBackground = async (page: Page) => {
	await interactWithElementInIframe(page, '#more-options-btn', { action: 'click' });
	await page.waitForTimeout(500);
	await interactWithElementInIframe(page, '#virtual-bg-btn', { action: 'click' });
	await interactWithElementInIframe(page, '#no_effect-btn', { action: 'click' });
	await page.waitForTimeout(500); // Wait for background to be removed
};

/**
 * Analyzes the current video frame to determine if the virtual background has been applied
 * by checking if most pixels are different from Chrome's synthetic green background
 */
export const isVirtualBackgroundApplied = async (
	page: Page,
	videoSelector: string = '.OV_video-element',
	options: {
		minChangedPixelsPercent?: number; // Minimum % of non-green pixels to consider background applied
		saveDebugImages?: boolean; // Save images for debugging
	} = {}
): Promise<boolean> => {
	const {
		minChangedPixelsPercent = 70, // At least 20% of pixels should be non-green
		saveDebugImages = false
	} = options;

	try {
		// Capture current video frame
		const screenshotPath = `test-results/vbg_check_${Date.now()}.png`;
		await saveScreenshot(page, screenshotPath, videoSelector);

		// Read the captured image
		const currentFrame = PNG.sync.read(fs.readFileSync(screenshotPath));
		const { width, height } = currentFrame;

		// Count green pixels (sample every 5th pixel for performance)
		let greenPixels = 0;
		let totalSampled = 0;

		for (let y = 0; y < height; y += 5) {
			for (let x = 0; x < width; x += 5) {
				const idx = (width * y + x) << 2;

				const r = currentFrame.data[idx];
				const g = currentFrame.data[idx + 1];
				const b = currentFrame.data[idx + 2];

				totalSampled++;

				if (isChromeSyntheticGreen(r, g, b)) {
					greenPixels++;
				}
			}
		}

		const greenPercentage = (greenPixels / totalSampled) * 100;
		const nonGreenPercentage = 100 - greenPercentage;
		const backgroundApplied = nonGreenPercentage >= minChangedPixelsPercent;

		console.log(
			`Video Analysis: ${nonGreenPercentage.toFixed(1)}% non-green pixels - Background applied: ${backgroundApplied}`
		);

		// Cleanup
		if (!saveDebugImages) {
			fs.unlinkSync(screenshotPath);
		}

		return backgroundApplied;
	} catch (error) {
		console.error('Error checking virtual background:', error);
		return false;
	}
};

/**
 * Detects if a pixel is part of Chrome's synthetic green screen
 * Chrome's fake video can vary, but typically has these characteristics:
 * - Green channel is dominant
 * - Overall brightness suggests synthetic content
 * - Color tends to be uniformly distributed
 */
const isChromeSyntheticGreen = (r: number, g: number, b: number): boolean => {
	// Method 1: Classic bright green detection (loose tolerances)
	const isBrightGreen = g > 150 && g > r + 50 && g > b + 50 && r < 100 && b < 100;

	// Method 2: Detect greenish hues with high saturation
	const isGreenish = g > Math.max(r, b) && g > 100;
	const hasLowRedBlue = r + b < g * 0.6;
	const isGreenDominant = isGreenish && hasLowRedBlue;

	// Method 3: Check for uniform synthetic-looking colors
	// Chrome often uses specific green values
	const isTypicalChromeGreen =
		(g >= 240 && r <= 50 && b <= 50) || // Very bright green
		(g >= 200 && r <= 80 && b <= 80) || // Bright green
		(g >= 160 && r <= 60 && b <= 60); // Medium green

	// Method 4: HSV-like check - high green saturation
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const saturation = max > 0 ? (max - min) / max : 0;
	const isHighSaturationGreen = g === max && saturation > 0.5 && g > 120;

	// Return true if any of the methods detect green
	return isBrightGreen || isGreenDominant || isTypicalChromeGreen || isHighSaturationGreen;
};

/**
 * Helper function that waits for virtual background to be applied
 */
export const waitForVirtualBackgroundToApply = async (page: Page, maxWaitTime: number = 5000): Promise<boolean> => {
	const startTime = Date.now();

	while (Date.now() - startTime < maxWaitTime) {
		const isApplied = await isVirtualBackgroundApplied(page);

		if (isApplied) {
			console.log('✅ Virtual background detected');
			return true;
		}

		await page.waitForTimeout(500); // Check every 500ms
	}

	console.log('❌ Virtual background not detected after waiting');
	return false;
};

export const saveScreenshot = async (page: Page, filename: string, selector: string) => {
	const element = await waitForElementInIframe(page, selector);
	await element.screenshot({ path: filename });
};

export const openMoreOptionsMenu = async (page: Page) => {
	await waitForElementInIframe(page, '#toolbar', { state: 'visible' });
	// Open more options menu
	await interactWithElementInIframe(page, '#more-options-btn', { action: 'click' });
	await page.waitForTimeout(500); // Wait for menu animation
};

export const closeMoreOptionsMenu = async (page: Page) => {
	await interactWithElementInIframe(page, 'body', { action: 'click' });
	await page.waitForTimeout(500); // Wait for menu to close
};

// ==========================================
// MODERATION HELPER FUNCTIONS
// ==========================================

/**
 * Gets the participant ID (sid) of a participant by name from a specific page view
 * @param page - Playwright page object
 * @param participantName - Name of the participant to find
 * @returns Promise resolving to the participant ID (sid) or empty string if not found
 */
export const getParticipantIdByName = async (page: Page, participantName: string): Promise<string> => {
	// Get iframe using the proper Playwright method
	const frameLocator = await getIframeInShadowDom(page);

	// Find all participant containers
	const participantContainers = frameLocator.locator('[data-participant-id]');
	const count = await participantContainers.count();
	console.log(`🔍 Found ${count} participant containers`);

	// Iterate through participants to find the matching name
	for (let i = 0; i < count; i++) {
		const container = participantContainers.nth(i);
		const nameElement = container.locator('.participant-name-text');
		const pName = await nameElement.textContent();
		const pId = await container.getAttribute('data-participant-id');

		console.log(`👤 Participant: "${pName?.trim()}" with ID: ${pId}`);

		if (pName?.trim() === participantName) {
			console.log(`✅ Found matching participant: ${participantName} with ID: ${pId}`);
			return pId || '';
		}
	}

	console.log(`❌ Could not find participant with name: ${participantName}`);
	return '';
};

/**
 * Gets the current user's own participant ID (sid)
 * @param page - Playwright page object
 * @returns Promise resolving to the local participant's ID (sid) or empty string if not found
 */
export const getLocalParticipantId = async (page: Page): Promise<string> => {
	// Get iframe using the proper Playwright method
	const frameLocator = await getIframeInShadowDom(page);

	// Find all participant containers
	const participantContainers = frameLocator.locator('[data-participant-id]');
	const count = await participantContainers.count();
	console.log(`🔍 Found ${count} participant containers`);

	// Iterate through participants to find the local one (has .local-indicator)
	for (let i = 0; i < count; i++) {
		const container = participantContainers.nth(i);
		const youLabel = container.locator('.local-indicator');
		const hasYouLabel = (await youLabel.count()) > 0;

		if (hasYouLabel) {
			const nameElement = container.locator('.participant-name-text');
			const participantName = await nameElement.textContent();
			const pId = await container.getAttribute('data-participant-id');

			console.log(`✅ Found local participant: "${participantName?.trim()}" with ID: ${pId}`);
			return pId || '';
		}
	}

	console.log('❌ Could not find local participant');
	return '';
};

/**
 * Opens the participants panel and waits for it to be visible
 * @param page - Playwright page object
 */
export const openParticipantsPanel = async (page: Page): Promise<void> => {
	await waitForElementInIframe(page, '#participants-panel-btn');
	await interactWithElementInIframe(page, '#participants-panel-btn', { action: 'click' });
	await waitForElementInIframe(page, 'ov-participants-panel', { state: 'visible' });
	await page.waitForTimeout(1000); // Wait for panel to fully load
};

/**
 * Makes a participant a moderator by clicking the make-moderator button
 * @param page - Playwright page object (moderator's page)
 * @param participantId - The participant ID (sid) to promote
 */
export const makeParticipantModerator = async (page: Page, participantId: string): Promise<void> => {
	const makeModeratorbtn = await waitForElementInIframe(page, `#make-moderator-btn-${participantId}`, {
		state: 'visible',
		timeout: 10000
	});
	await makeModeratorbtn.click();
	await page.waitForTimeout(2000); // Wait for role change to propagate
};

/**
 * Removes moderator role from a participant by clicking the remove-moderator button
 * @param page - Playwright page object (moderator's page)
 * @param participantId - The participant ID (sid) to demote
 */
export const removeParticipantModerator = async (page: Page, participantId: string): Promise<void> => {
	const removeModeratorbtn = await waitForElementInIframe(page, `#remove-moderator-btn-${participantId}`, {
		state: 'visible',
		timeout: 10000
	});
	await removeModeratorbtn.click();
	await page.waitForTimeout(2000); // Wait for role change to propagate
};

/**
 * Checks if an overlay element is hidden in the iframe
 * An element is considered hidden if:
 * - It doesn't exist in the DOM (removed)
 * - Has display: none
 * - Has visibility: hidden
 * - Has opacity: 0
 * @param page - Playwright page object
 * @param overlaySelector - CSS selector for the overlay element
 * @returns Promise resolving to true if the overlay is hidden, false otherwise
 */
export const isShareLinkOverlayyHidden = async (page: Page, overlaySelector: string): Promise<boolean> => {
	const frameLocator = await getIframeInShadowDom(page);
	const overlay = frameLocator.locator(overlaySelector);
	const count = await overlay.count();

	// Element doesn't exist in the DOM
	if (count === 0) {
		console.log('✅ Overlay element not found in DOM (removed)');
		return true;
	}

	// Check if element is hidden via CSS
	const isVisible = await overlay.isVisible().catch(() => false);

	if (!isVisible) {
		console.log('✅ Overlay is hidden (display: none, visibility: hidden, or opacity: 0)');
		return true;
	}

	console.log('❌ Overlay is still visible');
	return false;
};
