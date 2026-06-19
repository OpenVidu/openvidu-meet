import { expect, test } from '@playwright/test';
import { startScreensharing, stopScreensharing, toggleMicrophone } from './helpers/media-controls.helper';
import { createRoomAndGetAnonymousAccessUrl, deleteRooms } from './helpers/meet-api.helper';
import { openMeeting } from './helpers/meeting-navigation.helper';
import {
	openLayoutSettingsPanel,
	openSettingsPanel,
	toggleActivitiesPanel,
	toggleChatPanel,
	toggleParticipantsPanel
} from './helpers/panels.helper';
import { joinParticipants } from './helpers/participant-management.helper';
import { expectCopiedUrl, expectHidden, expectVisible, installClipboardCapture } from './helpers/ui-utils.helper';

test.describe('Panels E2E Tests', () => {
	const createdRoomIds: string[] = [];

	let roomId: string;
	let accessUrl: string;

	test.beforeEach(async () => {
		const { room, accessUrl: url } = await createRoomAndGetAnonymousAccessUrl();
		roomId = room.roomId;
		accessUrl = url;
		createdRoomIds.push(roomId);
	});

	test.afterAll(async () => {
		await deleteRooms(createdRoomIds);
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

		test('should reactively toggle screen-share and mic-off indicators while the panel is open', async ({
			browser
		}) => {
			const { pages, removeAllParticipants } = await joinParticipants(browser, {
				roomId,
				accessUrl,
				participants: [{ name: 'participant-0' }, { name: 'participant-1', headless: true }]
			});
			const [pageA, pageB] = pages;

			try {
				// A opens the participants panel BEFORE B's state changes — the panel must react in place.
				await toggleParticipantsPanel(pageA);
				await expect(pageA.locator('.local-participant-container')).toBeVisible({ timeout: 5_000 });
				const remoteItem = pageA.locator('#remote-participant-item ov-participant-panel-item').first();
				await expect(remoteItem).toBeVisible({ timeout: 5_000 });
				const screenIcon = remoteItem.locator('#screen-share-indicator');
				const micOffIcon = remoteItem.locator('#mic-off-indicator');

				// Initially: no screen sharing, mic on → neither indicator visible.
				await expect(screenIcon).toHaveCount(0);
				await expect(micOffIcon).toHaveCount(0);

				// B starts screen sharing → screen-share icon appears.
				await startScreensharing(pageB);
				await expect(screenIcon).toHaveCount(1, { timeout: 10_000 });
				await expect(screenIcon).toBeVisible();

				// B mutes their mic → mic-off icon appears (screen-share icon still visible).
				await toggleMicrophone(pageB);
				await expect(micOffIcon).toHaveCount(1, { timeout: 5_000 });
				await expect(micOffIcon).toBeVisible();
				await expect(screenIcon).toHaveCount(1);

				// B un-mutes → mic-off icon disappears.
				await toggleMicrophone(pageB);
				await expect(micOffIcon).toHaveCount(0, { timeout: 5_000 });

				// B stops screen sharing → screen-share icon disappears.
				await stopScreensharing(pageB);
				await expect(screenIcon).toHaveCount(0, { timeout: 10_000 });
			} finally {
				await removeAllParticipants();
			}
		});

		test('should copy meeting url from participant panel copy button', async ({ page }) => {
			await openMeeting(page, accessUrl);

			await toggleParticipantsPanel(page);
			await expectVisible(page, '.local-participant-container');
			await expectVisible(page, '.share-room-access-link-container .copy-url-btn');
			await installClipboardCapture(page);

			await page.locator('.share-room-access-link-container .copy-url-btn').first().click();
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
