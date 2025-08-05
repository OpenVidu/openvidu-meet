import { expect, FrameLocator, Locator, Page } from '@playwright/test';
import * as fs from 'fs';
import { PNG } from 'pngjs';
import { MeetRecordingAccess, MeetRoomPreferences } from '../../../../typings/src/room-preferences';
import { MEET_ADMIN_PASSWORD, MEET_ADMIN_USER, MEET_API_KEY, MEET_API_URL, MEET_TESTAPP_URL } from '../config';

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

// Helper function to get default room preferences
const getDefaultRoomPreferences = (): MeetRoomPreferences => ({
	recordingPreferences: {
		enabled: true,
		allowAccessTo: MeetRecordingAccess.ADMIN_MODERATOR_PUBLISHER
	},
	chatPreferences: { enabled: true },
	virtualBackgroundPreferences: { enabled: true }
});

// Helper function to create a room for testing
export const createTestRoom = async (
	roomName: string,
	preferences: MeetRoomPreferences = getDefaultRoomPreferences()
) => {
	const response = await fetch(`${MEET_API_URL}/api/v1/rooms`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'x-api-key': MEET_API_KEY
		},
		body: JSON.stringify({
			roomName,
			autoDeletionDate: new Date(Date.now() + 61 * 60 * 1000).getTime(), // 1 hour from now
			preferences
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

// Helper function to update room preferences via REST API
export const updateRoomPreferences = async (roomId: string, preferences: any, adminCookie: string) => {
	const response = await fetch(`${MEET_API_URL}/api/v1/rooms/${roomId}`, {
		method: 'PUT',
		headers: {
			'Content-Type': 'application/json',
			Cookie: adminCookie
		},
		body: JSON.stringify(preferences)
	});

	if (!response.ok) {
		throw new Error(`Failed to update room preferences: ${response.status} ${await response.text()}`);
	}

	return response.json();
};

// Helper function to login and get admin cookie
export const loginAsAdmin = async (): Promise<string> => {
	const response = await fetch(`${MEET_API_URL}/internal-api/v1/auth/login`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			username: MEET_ADMIN_USER,
			password: MEET_ADMIN_PASSWORD
		})
	});

	if (!response.ok || response.status !== 200) {
		console.error('Login failed:', await response.text());
		throw new Error(`Failed to login: ${response.status}`);
	}

	const cookies = response.headers.get('set-cookie') || '';
	if (!cookies) {
		throw new Error('No cookies received from login');
	}

	// Extract the access token cookie
	const accessTokenCookie = cookies.split(';').find((cookie) => cookie.trim().startsWith('OvMeetAccessToken='));
	if (!accessTokenCookie) {
		throw new Error('Access token cookie not found');
	}

	return accessTokenCookie.trim();
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
	await waitForElementInIframe(page, 'ov-session', { state: 'visible' });
};

export const accessRoomAs = async (role: 'moderator' | 'publisher', page: Page) => {
	await page.click('#join-as-' + role);
	const component = page.locator('openvidu-meet');
	await expect(component).toBeVisible();
};

export const viewRecordingsAs = async (role: 'moderator' | 'publisher', page: Page) => {
	await page.click('#join-as-' + role);
	const component = page.locator('openvidu-meet');
	await expect(component).toBeVisible();

	await interactWithElementInIframe(page, '#view-recordings-btn', { action: 'click' });
};

export const leaveRoom = async (page: Page, role: 'moderator' | 'publisher' = 'publisher') => {
	const button = await waitForElementInIframe(page, '#leave-btn');
	await button.click();

	if (role === 'moderator') {
		await page.waitForTimeout(500); // Wait for leave animation
		const option = await waitForElementInIframe(page, '#leave-option');
		await option.click();
	}

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
