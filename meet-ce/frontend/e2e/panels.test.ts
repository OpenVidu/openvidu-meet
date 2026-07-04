import { test } from '@playwright/test';
import { createRoomAndGetAnonymousAccessUrl, deleteRooms } from './helpers/meet-api.helper';
import { openMeeting } from './helpers/meeting-navigation.helper';
import {
	openSettingsPanel,
	toggleActivitiesPanel,
	toggleChatPanel,
	toggleParticipantsPanel
} from './helpers/panels.helper';
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
