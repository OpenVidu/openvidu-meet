import { expect, test } from '@playwright/test';
import { createRoomAndGetAnonymousAccessUrl, deleteRooms } from './helpers/meet-api.helper';
import {
	expectCopiedUrl,
	expectHidden,
	expectVisible,
	installClipboardCapture,
	openLayoutSettingsPanel,
	openMeeting,
	openSettingsPanel,
	toggleActivitiesPanel,
	toggleChatPanel,
	toggleParticipantsPanel
} from './helpers/meeting-ui.helper';

test.describe('Panels E2E Tests', () => {
	let roomId: string;
	let accessUrl: string;

	test.beforeAll(async () => {
		const { room, accessUrl: url } = await createRoomAndGetAnonymousAccessUrl();
		roomId = room.roomId;
		accessUrl = url;
	});

	test.afterAll(async () => {
		await deleteRooms([roomId]);
	});

	test.describe('UI Navigation and Section Switching', () => {
		test('should switch between PARTICIPANTS and CHAT panels and verify correct content is shown', async ({
			page
		}) => {
			await openMeeting(page, accessUrl);

			await toggleChatPanel(page);
			await expectVisible(page, '.sidenav-menu');
			await expectVisible(page, '#chat-input');
			await expectVisible(page, '#chat-container .messages-container');

			await toggleParticipantsPanel(page);
			await expectVisible(page, '.local-participant-container');
			await expectVisible(page, 'ov-participant-panel-item');
			await expectHidden(page, '#chat-input');
			await expectHidden(page, '#chat-container .messages-container');

			await toggleChatPanel(page);
			await expectVisible(page, '#chat-input');
			await expectVisible(page, '#chat-container .messages-container');
			await expectHidden(page, '.local-participant-container');
			await expectHidden(page, 'ov-participant-panel-item');
		});
	});

	test.describe('Settings Panel', () => {
		test('should open the SETTINGS panel and verify its content', async ({ page }) => {
			await openMeeting(page, accessUrl);

			await openSettingsPanel(page);
			await expectVisible(page, '#default-settings-panel');
		});

		test('should switch between sections in the SETTINGS panel and verify correct content is shown', async ({
			page
		}) => {
			await openMeeting(page, accessUrl);

			await openSettingsPanel(page);
			await expectVisible(page, '.sidenav-menu');

			await page.locator('#general-opt').click();
			await expectVisible(page, 'ov-participant-name-input');

			await page.locator('#video-opt').click();
			await expectVisible(page, 'ov-video-devices-select');

			await page.locator('#audio-opt').click();
			await expectVisible(page, 'ov-audio-devices-select');
		});

		test('should open settings panel clicking layout toolbar button', async ({ page }) => {
			await openMeeting(page, accessUrl);

			await openLayoutSettingsPanel(page);
			await expect(page.locator('.layout-section')).toBeVisible();
			await expect(page.locator('.theme-section')).toBeVisible();
		});
	});

	test.describe('Chat Panel', () => {
		test('should open and close the CHAT panel and verify its content', async ({ page }) => {
			await openMeeting(page, accessUrl);

			await toggleChatPanel(page, 'open');
			await expectVisible(page, '#chat-input');
			await expectVisible(page, '#chat-container .messages-container');

			await toggleChatPanel(page, 'close');
		});
	});

	test.describe('Participants Panel', () => {
		test('should open and close the PARTICIPANTS panel and verify its content', async ({ page }) => {
			await openMeeting(page, accessUrl);

			await toggleParticipantsPanel(page);
			await expectVisible(page, '.sidenav-menu');
			await expectVisible(page, '.local-participant-container');
			await expectVisible(page, 'ov-participant-panel-item');

			await toggleParticipantsPanel(page);
			await expectHidden(page, '.local-participant-container');
			await expectHidden(page, 'ov-participant-panel-item');
		});

		test('should show participant role badge in participant panel item', async ({ page }) => {
			await openMeeting(page, accessUrl);

			await toggleParticipantsPanel(page);
			await expectVisible(page, '.local-participant-container');

			const roleBadge = page.locator('[id^="participant-badge-"]').first();
			await expect(roleBadge).toBeVisible();
			await expect(roleBadge).toHaveClass(/owner-badge|admin-badge|moderator-badge/);
		});

		test('should copy meeting url from participant panel copy button', async ({ page }) => {
			await openMeeting(page, accessUrl);

			await toggleParticipantsPanel(page);
			await expectVisible(page, '.local-participant-container');
			await expectVisible(page, '.share-meeting-link-container .copy-url-btn');
			await installClipboardCapture(page);

			await page.locator('.share-meeting-link-container .copy-url-btn').first().click();
			await expectCopiedUrl(page);
		});
	});

	test.describe('Activities Panel', () => {
		test('should open and close the ACTIVITIES panel and verify its content', async ({ page }) => {
			await openMeeting(page, accessUrl);

			await toggleActivitiesPanel(page);
			await expectVisible(page, '.sidenav-menu');
			await expectVisible(page, '#activities-container');
			await expectVisible(page, '#recording-activity');

			await toggleActivitiesPanel(page);
			await expectHidden(page, '#activities-container');
			await expectHidden(page, '#recording-activity');
		});
	});
});
