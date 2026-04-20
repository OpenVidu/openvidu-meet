import { expect, test } from '@playwright/test';
import { createRoomAndGetAccessUrl, deleteRooms } from './helpers/meet-api.helper';
import {
	expectCopiedUrl,
	expectHidden,
	expectVisible,
	installClipboardCapture,
	openMeeting,
	openSettingsPanel,
	toggleActivitiesPanel,
	toggleChatPanel,
	toggleParticipantsPanel
} from './helpers/meeting-ui.helper';

test.describe('Panels: UI Navigation and Section Switching', () => {
	test.describe.configure({ timeout: 90_000 });
	const createdRoomIds = new Set<string>();

	test.afterAll(async () => {
		await deleteRooms(createdRoomIds);
	});

	test('should open and close the CHAT panel and verify its content', async ({ page }) => {
		const { accessUrl } = await createRoomAndGetAccessUrl(`panel-chat-${Date.now()}`, undefined, undefined, createdRoomIds);
		await openMeeting(page, accessUrl);

		await toggleChatPanel(page, 'open');
		await expectVisible(page, '.input-container');
		await expectVisible(page, '.messages-container');

		await toggleChatPanel(page, 'close');
	});

	test('should open and close the PARTICIPANTS panel and verify its content', async ({ page }) => {
		const { accessUrl } = await createRoomAndGetAccessUrl(`panel-participants-${Date.now()}`, undefined, undefined, createdRoomIds);
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
		const { accessUrl } = await createRoomAndGetAccessUrl(`panel-owner-badge-${Date.now()}`, undefined, undefined, createdRoomIds);
		await openMeeting(page, accessUrl);

		await toggleParticipantsPanel(page);
		await expectVisible(page, '.local-participant-container');

		const roleBadge = page.locator('[id^="participant-badge-"]').first();
		await expect(roleBadge).toBeVisible();
		await expect(roleBadge).toHaveClass(/owner-badge|admin-badge|moderator-badge/);
	});

	test('should copy meeting url from participant panel copy button', async ({ page }) => {
		const { accessUrl } = await createRoomAndGetAccessUrl(`panel-copy-url-${Date.now()}`, undefined, undefined, createdRoomIds);
		await openMeeting(page, accessUrl);

		await toggleParticipantsPanel(page);
		await expectVisible(page, '.local-participant-container');
		await expectVisible(page, '.share-meeting-link-container .copy-url-btn');
		await installClipboardCapture(page);

		await page.locator('.share-meeting-link-container .copy-url-btn').first().click();
		await expectCopiedUrl(page);
	});

	test('should open and close the ACTIVITIES panel and verify its content', async ({ page }) => {
		const { accessUrl } = await createRoomAndGetAccessUrl(`panel-activities-${Date.now()}`, undefined, undefined, createdRoomIds);
		await openMeeting(page, accessUrl);

		await toggleActivitiesPanel(page);
		await expectVisible(page, '.sidenav-menu');
		await expectVisible(page, '#activities-container');
		await expectVisible(page, '#recording-activity');

		await toggleActivitiesPanel(page);
		await expectHidden(page, '#activities-container');
		await expectHidden(page, '#recording-activity');
	});

	test('should open the SETTINGS panel and verify its content', async ({ page }) => {
		const { accessUrl } = await createRoomAndGetAccessUrl(`panel-settings-${Date.now()}`, undefined, undefined, createdRoomIds);
		await openMeeting(page, accessUrl);

		await openSettingsPanel(page);
		await expectVisible(page, '#default-settings-panel');
	});

	test('should switch between PARTICIPANTS and CHAT panels and verify correct content is shown', async ({ page }) => {
		const { accessUrl } = await createRoomAndGetAccessUrl(`panel-switch-${Date.now()}`, undefined, undefined, createdRoomIds);
		await openMeeting(page, accessUrl);

		await toggleChatPanel(page);
		await expectVisible(page, '.sidenav-menu');
		await expectVisible(page, '.input-container');
		await expectVisible(page, '.messages-container');

		await toggleParticipantsPanel(page);
		await expectVisible(page, '.local-participant-container');
		await expectVisible(page, 'ov-participant-panel-item');
		await expectHidden(page, '.input-container');
		await expectHidden(page, '.messages-container');

		await toggleChatPanel(page);
		await expectVisible(page, '.input-container');
		await expectVisible(page, '.messages-container');
		await expectHidden(page, '.local-participant-container');
		await expectHidden(page, 'ov-participant-panel-item');

		await toggleChatPanel(page);
		await expectHidden(page, '.input-container');
		await expectHidden(page, '.messages-container');
	});

	test('should switch between sections in the SETTINGS panel and verify correct content is shown', async ({
		page
	}) => {
		const { accessUrl } = await createRoomAndGetAccessUrl(`panel-sections-${Date.now()}`, undefined, undefined, createdRoomIds);
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
});
