import { expect, test } from '@playwright/test';
import { toggleChatPanel } from './helpers/chat.helper';
import { createRoomAndGetAnonymousAccessUrl, deleteRooms } from './helpers/meet-api.helper';
import { openMeeting } from './helpers/meeting-navigation.helper';
import { openSettingsPanel, toggleActivitiesPanel, toggleParticipantsPanel } from './helpers/panels.helper';
import { expectHidden, expectVisible } from './helpers/ui-utils.helper';

test.describe('Panels E2E Tests', () => {
	const createdRoomIds: string[] = [];

	let accessUrl: string;

	test.beforeEach(async () => {
		const { room, accessUrl: url } = await createRoomAndGetAnonymousAccessUrl();
		accessUrl = url;
		createdRoomIds.push(room.roomId);
	});

	test.afterAll(async () => {
		await deleteRooms(createdRoomIds);
	});

	test('should open, close and switch between the meeting panels showing their content', async ({ page }) => {
		await openMeeting(page, accessUrl);

		await test.step('should open and close the CHAT panel and verify its content', async () => {
			await toggleChatPanel(page, 'open');
			await expectVisible(page, '#chat-input');
			await expectVisible(page, '#chat-container .messages-container');

			await toggleChatPanel(page, 'close');
		});

		await test.step('should open and close the PARTICIPANTS panel and verify its content', async () => {
			await toggleParticipantsPanel(page);
			await expectVisible(page, '.sidenav-menu');
			await expectVisible(page, '.local-participant-container');
			await expectVisible(page, 'ov-participant-panel-item');

			await toggleParticipantsPanel(page);
			await expectHidden(page, '.local-participant-container');
			await expectHidden(page, 'ov-participant-panel-item');
		});

		await test.step('should switch between PARTICIPANTS and CHAT panels and verify correct content is shown', async () => {
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

			await toggleChatPanel(page, 'close');
		});

		await test.step('should open and close the ACTIVITIES panel and verify its content', async () => {
			await toggleActivitiesPanel(page);
			await expectVisible(page, '.sidenav-menu');
			await expectVisible(page, '#activities-container');
			await expectVisible(page, '#recording-activity');

			await toggleActivitiesPanel(page);
			await expectHidden(page, '#activities-container');
			await expectHidden(page, '#recording-activity');
		});

		await test.step('should open the SETTINGS panel and verify its content', async () => {
			await openSettingsPanel(page);
			await expectVisible(page, '#default-settings-panel');
		});

		await test.step('should switch between sections in the SETTINGS panel and verify correct content is shown', async () => {
			await expectVisible(page, '.sidenav-menu');

			await page.locator('#general-opt').click();
			await expectVisible(page, '#settings-display-name');

			await page.locator('#layout-opt').click();
			await expectVisible(page, '#layout-smart-mosaic');

			await page.locator('#audio-video-opt').click();
			await expectVisible(page, 'ov-video-devices-select');
			await expectVisible(page, 'ov-audio-devices-select');
		});
	});

	test('should open a panel beside the grid above 790px and over the meeting at 790px or less', async ({ page }) => {
		const widthOf = async (selector: string): Promise<number> =>
			(await page.locator(selector).boundingBox())!.width;

		await openMeeting(page, accessUrl);

		await test.step('should shrink the grid to make room for the panel in a 791px window', async () => {
			await page.setViewportSize({ width: 791, height: 800 });
			await expect.poll(() => widthOf('#layout')).toBeGreaterThan(770);
			const gridWidth = await widthOf('#layout');

			await toggleChatPanel(page, 'open');

			await expect.poll(() => widthOf('#layout')).toBeLessThan(gridWidth);
			await expect
				.poll(async () => {
					const grid = (await page.locator('#layout').boundingBox())!;
					const panel = (await page.locator('.sidenav-menu').boundingBox())!;
					return panel.x - (grid.x + grid.width);
				})
				.toBeGreaterThanOrEqual(0);
			await toggleChatPanel(page, 'close');
		});

		await test.step('should cover the meeting at full width and keep the grid in a 790px window', async () => {
			await page.setViewportSize({ width: 790, height: 800 });

			await toggleChatPanel(page, 'open');

			await expect.poll(async () => (await page.locator('.sidenav-menu').boundingBox())?.x).toBe(0);
			expect(await widthOf('.sidenav-menu')).toBe(790);
			await expect.poll(() => widthOf('#layout')).toBeGreaterThan(770);
		});
	});
});
