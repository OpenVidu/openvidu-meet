import { MeetRoomThemeMode } from '@openvidu-meet/typings';
import { expect, test } from '@playwright/test';
import { createReadyUser } from './helpers/auth.helper';
import { applyBackgroundEffect, openRoomBackgroundsPanel } from './helpers/media-controls.helper';
import {
	createRoomAndGetAnonymousAccessUrl,
	deleteRooms,
	deleteUsers,
	updateRoomsAppearance
} from './helpers/meet-api.helper';
import { expectEndScreen, leaveMeeting, openJoinScreen, openMeeting } from './helpers/meeting-navigation.helper';
import { openMoreOptionsMenu, toggleActivitiesPanel } from './helpers/panels.helper';
import { expectHidden, expectVisible } from './helpers/ui-utils.helper';

test.describe('Room UI Features E2E Tests', () => {
	const createdRoomIds: string[] = [];
	const createdUserIds: string[] = [];

	test.afterAll(async () => {
		await Promise.all([deleteRooms(createdRoomIds), deleteUsers(createdUserIds)]);
	});

	test.describe('Chat Feature', () => {
		test('should hide chat button when chat is disabled', async ({ page }) => {
			const { room, accessUrl } = await createRoomAndGetAnonymousAccessUrl({
				config: { chat: { enabled: false } }
			});
			createdRoomIds.push(room.roomId);

			await openMeeting(page, accessUrl);
			await expectHidden(page, '#chat-panel-btn');
		});
	});

	test.describe('Recording Feature', () => {
		test('should show recording button and activities panel when recording is enabled', async ({ page }) => {
			const { room, accessUrl } = await createRoomAndGetAnonymousAccessUrl({
				config: { recording: { enabled: true } }
			});
			createdRoomIds.push(room.roomId);

			await openMeeting(page, accessUrl);

			await openMoreOptionsMenu(page);
			await expectVisible(page, '#recording-btn');
			await page.keyboard.press('Escape');

			await toggleActivitiesPanel(page);
			await expectVisible(page, 'ov-recording-activity');
		});

		test('should not show recording button nor activities panel when recording is disabled', async ({ page }) => {
			const { room, accessUrl } = await createRoomAndGetAnonymousAccessUrl({
				config: { recording: { enabled: false } }
			});
			createdRoomIds.push(room.roomId);

			await openMeeting(page, accessUrl);

			await openMoreOptionsMenu(page);
			await expectHidden(page, '#recording-btn');
			await page.keyboard.press('Escape');

			await expectHidden(page, '#activities-panel-btn');
		});
	});

	test.describe('Duration Limit Feature', () => {
		test('should count down beside the elapsed time, and keep only the countdown on a phone', async ({ page }) => {
			const { room, accessUrl } = await createRoomAndGetAnonymousAccessUrl({
				config: { maxDurationMinutes: 5 }
			});
			createdRoomIds.push(room.roomId);

			await openMeeting(page, accessUrl);
			await expectVisible(page, '#meeting-ending-soon');
			await expectVisible(page, '#meeting-elapsed-time');

			await page.setViewportSize({ width: 360, height: 780 });

			await expectVisible(page, '#meeting-ending-soon');
			await expectHidden(page, '#meeting-elapsed-time');
		});

		test('should end the meeting at its duration limit and say so on the end screen', async ({ page }) => {
			const { room, accessUrl } = await createRoomAndGetAnonymousAccessUrl({
				config: { maxDurationMinutes: 1 }
			});
			createdRoomIds.push(room.roomId);

			await openMeeting(page, accessUrl);

			await expectEndScreen(
				page,
				'Meeting Ended',
				'This meeting was automatically ended because it reached its maximum duration',
				30_000
			);
		});
	});

	test.describe('Virtual Background Feature', () => {
		test('should not apply virtual background when saved in local storage and feature is disabled', async ({
			page
		}) => {
			// Step 1: Join a room with VB enabled and apply a background (saves preference to localStorage)
			const { room: room1, accessUrl: accessUrl1 } = await createRoomAndGetAnonymousAccessUrl({
				config: { virtualBackground: { enabled: true } }
			});
			createdRoomIds.push(room1.roomId);

			await openMeeting(page, accessUrl1);
			await openRoomBackgroundsPanel(page);
			await applyBackgroundEffect(page, 'professional-1');
			await leaveMeeting(page);

			// Step 2: Join a room with VB disabled and verify the saved preference is not applied
			const { room: room2, accessUrl: accessUrl2 } = await createRoomAndGetAnonymousAccessUrl({
				config: { virtualBackground: { enabled: false } }
			});
			createdRoomIds.push(room2.roomId);

			await openMeeting(page, accessUrl2);
			await expect(page.locator('#background-effects-container')).toHaveCount(0);

			await openMoreOptionsMenu(page);
			await expectHidden(page, '#virtual-bg-btn');
		});
	});

	test.describe('Appearance Feature', () => {
		test('should paint the join screen with the base and colors of the enabled theme', async ({ page }) => {
			const { user, accessToken } = await createReadyUser('Appearance Admin');
			createdUserIds.push(user.userId);
			const theme = {
				name: 'brand',
				enabled: true,
				baseTheme: MeetRoomThemeMode.DARK,
				primaryColor: '#e30613'
			};
			const { room, accessUrl } = await createRoomAndGetAnonymousAccessUrl();
			createdRoomIds.push(room.roomId);
			const themeVariable = (name: string) =>
				page.evaluate(
					(variable) => getComputedStyle(document.documentElement).getPropertyValue(variable).trim(),
					name
				);

			try {
				await updateRoomsAppearance(accessToken, theme);
				await openJoinScreen(page, accessUrl);

				await expect.poll(() => themeVariable('--ov-primary-action-color')).toBe('#e30613');
				await expect(page.locator('html')).toHaveAttribute('data-ov-theme', 'dark');
				await expect.poll(() => themeVariable('--ov-background-color')).toBe('#1f2020');
			} finally {
				await updateRoomsAppearance(accessToken, { ...theme, enabled: false });
			}
		});
	});
});
