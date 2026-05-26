import { expect, test } from '@playwright/test';
import { iframeLocator } from '../helpers/iframe.helper';
import { applyBackgroundEffect, startScreensharing, stopScreensharing } from '../helpers/media-controls.helper';
import { createRoom, deleteRooms } from '../helpers/meet-api.helper';
import { openMoreOptionsMenu } from '../helpers/panels.helper';
import { startRecording, stopRecording } from '../helpers/recordings.helper';
import { expectSignificantImageDifference, screenshotIframeElement } from '../helpers/stream.helper';
import { leaveMeeting, openMeeting } from '../helpers/testapp.helper';

test.describe('Room Features E2E Tests', () => {
	const createdRoomIds: string[] = [];
	let roomId: string;

	test.beforeEach(async () => {
		({ roomId } = await createRoom());
		createdRoomIds.push(roomId);
	});

	test.afterAll(async () => {
		await deleteRooms(createdRoomIds);
	});

	test.describe('Component Rendering', () => {
		test('should load the web component with proper iframe', async ({ page }) => {
			await openMeeting(page, roomId, { role: 'moderator' });

			await expect(page.locator('openvidu-meet')).toBeVisible();
			await expect(iframeLocator(page, 'body')).toBeAttached();

			await leaveMeeting(page, { role: 'moderator' });
		});
	});

	test.describe('Basic Room Features', () => {
		test('should start a videoconference and display video elements', async ({ page, browser }) => {
			await openMeeting(page, roomId, { role: 'speaker' });
			await expect(iframeLocator(page, '.OV_stream.local')).toBeVisible();

			const moderatorPage = await browser.newPage();
			await openMeeting(moderatorPage, roomId, { role: 'moderator' });

			await expect(iframeLocator(page, '.OV_stream.remote')).toBeVisible();

			await leaveMeeting(moderatorPage, { role: 'moderator' });
			await moderatorPage.close();

			await leaveMeeting(page);
		});

		test('should be able to share and stop screen sharing', async ({ page }) => {
			await openMeeting(page, roomId, { role: 'speaker' });
			await expect(iframeLocator(page, '#toolbar')).toBeVisible();

			const videos = iframeLocator(page, 'video');
			await expect(videos).toHaveCount(1);

			await startScreensharing(page);
			await expect(videos).toHaveCount(2);

			await stopScreensharing(page);
			await expect(videos).toHaveCount(1);

			await startScreensharing(page);
			await expect(videos).toHaveCount(2);

			await stopScreensharing(page);
			await expect(videos).toHaveCount(1);

			await leaveMeeting(page);
		});

		test('should apply virtual background and detect visual changes', async ({ page }) => {
			await openMeeting(page, roomId, { role: 'speaker' });

			const before = await screenshotIframeElement(page, '.OV_video-element');
			await applyBackgroundEffect(page, '2');
			const after = await screenshotIframeElement(page, '.OV_video-element');

			expectSignificantImageDifference(before, after, { threshold: 0.4, minDiffPixels: 500 });

			await leaveMeeting(page);
		});

		test('should start and stop a recording', async ({ page }) => {
			await openMeeting(page, roomId, { role: 'moderator' });

			await startRecording(page);
			await expect(iframeLocator(page, '#stop-recording-btn')).toBeVisible();

			await stopRecording(page);
			await expect(iframeLocator(page, '#stop-recording-btn')).toBeHidden();

			await leaveMeeting(page, { role: 'moderator' });
		});
	});

	test.describe('UI Panels and Components', () => {
		test('should show the toolbar and media buttons', async ({ page }) => {
			await openMeeting(page, roomId, { role: 'speaker' });

			await expect(iframeLocator(page, '#toolbar')).toBeVisible();
			await expect(iframeLocator(page, '#camera-btn')).toBeVisible();
			await expect(iframeLocator(page, '#mic-btn')).toBeVisible();

			await leaveMeeting(page);
		});

		test('should show and interact with chat panel', async ({ page }) => {
			await openMeeting(page, roomId, { role: 'speaker' });

			await iframeLocator(page, '#chat-panel-btn').click();

			const chatInput = iframeLocator(page, '#chat-input');
			await expect(chatInput).toBeVisible();
			await chatInput.fill('Hello world');
			await iframeLocator(page, '#send-btn').click();

			await expect(iframeLocator(page, '.chat-message')).toBeVisible();

			await leaveMeeting(page);
		});

		test('should show activities panel', async ({ page }) => {
			await openMeeting(page, roomId, { role: 'moderator' });

			await iframeLocator(page, '#activities-panel-btn').click();
			await expect(iframeLocator(page, 'ov-activities-panel')).toBeVisible();

			await leaveMeeting(page, { role: 'moderator' });
		});

		test('should show participants panel', async ({ page }) => {
			await openMeeting(page, roomId, { role: 'speaker' });

			await iframeLocator(page, '#participants-panel-btn').click();
			await expect(iframeLocator(page, 'ov-participants-panel')).toBeVisible();

			await leaveMeeting(page);
		});

		test('should show settings panel', async ({ page }) => {
			await openMeeting(page, roomId, { role: 'speaker' });

			await openMoreOptionsMenu(page);
			await iframeLocator(page, '#toolbar-settings-btn').click();

			await expect(iframeLocator(page, 'ov-settings-panel')).toBeVisible();

			await leaveMeeting(page);
		});
	});
});
