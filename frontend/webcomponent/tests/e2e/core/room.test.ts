import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import {
	applyVirtualBackground,
	deleteAllRecordings,
	deleteAllRooms,
	interactWithElementInIframe,
	joinRoomAs,
	leaveRoom,
	openMoreOptionsMenu,
	prepareForJoiningRoom,
	saveScreenshot,
	startScreenSharing,
	stopScreenSharing,
	waitForElementInIframe
} from '../../helpers/function-helpers.js';

let subscribedToAppErrors = false;

// Test suite for room functionality in OpenVidu Meet
test.describe('Room Functionality Tests', () => {
	const testAppUrl = 'http://localhost:5080';
	const testRoomPrefix = 'testing-room';
	let participantName = `P-${Math.random().toString(36).substring(2, 9)}`;

	// ==========================================
	// SETUP & TEARDOWN
	// ==========================================

	test.beforeAll(async ({ browser }) => {
		// Create a test room before all tests
		const tempContext = await browser.newContext();
		const tempPage = await tempContext.newPage();
		await tempPage.goto(testAppUrl);
		await tempPage.waitForSelector('.create-room');
		await tempPage.fill('#room-id-prefix', testRoomPrefix);
		await tempPage.click('.create-room-btn');
		await tempPage.waitForSelector(`#${testRoomPrefix}`);
		await tempPage.close();
		await tempContext.close();
	});

	test.beforeEach(async ({ page }) => {
		if (!subscribedToAppErrors) {
			page.on('console', (msg) => {
				const type = msg.type();
				const tag = type === 'error' ? 'ERROR' : type === 'warning' ? 'WARNING' : 'LOG';
				console.log('[' + tag + ']', msg.text());
			});
			subscribedToAppErrors = true;
		}
		await prepareForJoiningRoom(page, testAppUrl, testRoomPrefix);
		participantName = `P-${Math.random().toString(36).substring(2, 9)}`;
	});

	test.afterEach(async ({ context }) => {
		// Save storage state after each test
		await context.storageState({ path: 'test_localstorage_state.json' });
	});

	test.afterAll(async ({ browser }) => {
		const tempContext = await browser.newContext();
		const tempPage = await tempContext.newPage();
		await deleteAllRooms(tempPage);
		await deleteAllRecordings(tempPage);

		await tempContext.close();
		await tempPage.close();
	});

	// ==========================================
	// COMPONENT RENDERING TESTS
	// ==========================================
	test.describe('Component Rendering', () => {
		test('should load the web component with proper iframe', async ({ page }) => {
			await joinRoomAs('moderator', `P-${Math.random().toString(36).substring(2, 9)}`, page);

			const component = page.locator('openvidu-meet');
			await expect(component).toBeVisible();

			const hasIframe = await page.evaluate(() => {
				const component = document.querySelector('openvidu-meet');
				return !!component?.shadowRoot?.querySelector('iframe');
			});
			expect(hasIframe).toBeTruthy();
		});
	});

	// ==========================================
	// BASIC FUNCTIONALITY TESTS
	// ==========================================

	test.describe('Basic Room Features', () => {
		test('should show the toolbar and media buttons', async ({ page }) => {
			await joinRoomAs('publisher', `P-${Math.random().toString(36).substring(2, 9)}`, page);
			await waitForElementInIframe(page, '#toolbar');

			// Check media buttons are present
			await waitForElementInIframe(page, '#camera-btn');
			await waitForElementInIframe(page, '#mic-btn');

			await leaveRoom(page);
		});

		test('should start a videoconference and display video elements', async ({ page, browser }) => {
			// First participant joins
			await joinRoomAs('publisher', participantName, page);

			// Check local video element
			const localVideo = await waitForElementInIframe(page, '.OV_stream.local');
			await expect(localVideo).toBeVisible();

			// Second participant (moderator) joins
			const context = await browser.newContext();
			const moderatorPage = await context.newPage();
			await prepareForJoiningRoom(moderatorPage, testAppUrl, testRoomPrefix);

			await joinRoomAs('moderator', 'moderator', moderatorPage);

			// Verify session established and remote video appears
			await waitForElementInIframe(moderatorPage, '.OV_stream.remote');

			// Cleanup
			await leaveRoom(page);
			await leaveRoom(moderatorPage);
			await context.close();
		});
	});

	// ==========================================
	// SCREEN SHARING TESTS
	// ==========================================

	test.describe('Screen Sharing', () => {
		test('should be able to share and stop screen sharing', async ({ page }) => {
			await joinRoomAs('publisher', participantName, page);

			await waitForElementInIframe(page, '#toolbar');

			// Initial state: only camera video
			let videoCount = await page.frameLocator('iframe').locator('video').count();
			expect(videoCount).toBe(1);

			// Enable screen share
			await startScreenSharing(page);
			videoCount = await page.frameLocator('iframe').locator('video').count();
			expect(videoCount).toBe(2);

			// Disable screen share
			await stopScreenSharing(page);
			videoCount = await page.frameLocator('iframe').locator('video').count();
			expect(videoCount).toBe(1);

			// Test toggle functionality
			await startScreenSharing(page);
			videoCount = await page.frameLocator('iframe').locator('video').count();
			expect(videoCount).toBe(2);

			await stopScreenSharing(page);
			videoCount = await page.frameLocator('iframe').locator('video').count();
			expect(videoCount).toBe(1);

			await leaveRoom(page);
		});
	});

	// ==========================================
	// UI PANELS TESTS
	// ==========================================

	test.describe('UI Panels and Components', () => {
		test('should show and interact with chat panel', async ({ page }) => {
			await joinRoomAs('publisher', participantName, page);

			// Open chat panel
			await waitForElementInIframe(page, '#chat-panel-btn');
			await interactWithElementInIframe(page, '#chat-panel-btn', { action: 'click' });

			// Send a message
			await waitForElementInIframe(page, '#chat-input');
			await interactWithElementInIframe(page, '#chat-input', {
				action: 'fill',
				value: 'Hello world'
			});
			await interactWithElementInIframe(page, '#send-btn', { action: 'click' });

			// Verify message appears
			const chatMessage = await waitForElementInIframe(page, '.chat-message');
			await expect(chatMessage).toBeVisible();

			await leaveRoom(page);
		});

		test('should show activities panel', async ({ page }) => {
			await joinRoomAs('moderator', participantName, page);

			// Open activities panel
			await waitForElementInIframe(page, '#activities-panel-btn');
			await interactWithElementInIframe(page, '#activities-panel-btn', { action: 'click' });

			// Verify panel is visible
			const activitiesPanel = await waitForElementInIframe(page, 'ov-activities-panel');
			await expect(activitiesPanel).toBeVisible();

			await leaveRoom(page);
		});

		test('should show participants panel', async ({ page }) => {
			await joinRoomAs('publisher', participantName, page);

			// Open participants panel
			await waitForElementInIframe(page, '#participants-panel-btn');
			await interactWithElementInIframe(page, '#participants-panel-btn', { action: 'click' });

			// Verify panel is visible
			const participantsPanel = await waitForElementInIframe(page, 'ov-participants-panel');
			await expect(participantsPanel).toBeVisible();

			await leaveRoom(page);
		});

		test('should show settings panel', async ({ page }) => {
			await joinRoomAs('publisher', participantName, page);

			await openMoreOptionsMenu(page);

			// Open settings panel
			await interactWithElementInIframe(page, '#toolbar-settings-btn', { action: 'click' });

			// Verify panel is visible
			const settingsPanel = await waitForElementInIframe(page, 'ov-settings-panel');
			await expect(settingsPanel).toBeVisible();

			await leaveRoom(page);
		});
	});

	// ==========================================
	// ADVANCED FEATURES TESTS
	// ==========================================

	test.describe('Advanced Features', () => {
		test('should apply virtual background and detect visual changes', async ({ page }) => {
			await joinRoomAs('publisher', participantName, page);

			// Wait for video element to be ready
			await waitForElementInIframe(page, '.OV_video-element');

			// Capture baseline screenshot
			await saveScreenshot(page, 'before.png', '.OV_video-element');

			// Apply virtual background
			await applyVirtualBackground(page, '2');
			await page.waitForTimeout(1000); // Allow background processing time

			// Capture post-change screenshot
			await saveScreenshot(page, 'after.png', '.OV_video-element');

			// Compare images to detect changes
			const img1 = PNG.sync.read(fs.readFileSync('before.png'));
			const img2 = PNG.sync.read(fs.readFileSync('after.png'));
			const { width, height } = img1;
			const diff = new PNG({ width, height });

			const numDiffPixels = pixelmatch(img1.data, img2.data, diff.data, width, height, {
				threshold: 0.4
			});

			// Save diff for debugging purposes
			fs.writeFileSync('diff.png', PNG.sync.write(diff));

			// Verify significant visual change occurred
			expect(numDiffPixels).toBeGreaterThan(500);

			// Cleanup test artifacts
			fs.unlinkSync('before.png');
			fs.unlinkSync('after.png');
			fs.unlinkSync('diff.png');

			await leaveRoom(page);
		});
	});
});
