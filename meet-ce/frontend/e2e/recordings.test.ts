import { test } from '@playwright/test';
import { createRoomAndGetAccessUrl, deleteRooms } from './helpers/meet-api.helper';
import { leaveMeeting, openMeeting } from './helpers/meeting-ui.helper';
import {
	clickViewRecordingsButton,
	expectRecordingBadgeVisible,
	expectStartRecordingButtonVisible,
	expectStopRecordingButtonVisible,
	expectViewRecordingsButtonVisible,
	expectViewRecordingsPageOpened,
	startStopRecordingFromActivitiesPanel,
	startStopRecordingFromToolbar,
	waitForRecordingStarted
} from './helpers/recordings.helper';

test.describe('Recordings: E2E UI flows', () => {
	test.describe.configure({ timeout: 30_000 });
	const createdRoomIds = new Set<string>();

	test.afterEach(async ({ page }) => {
		await leaveMeeting(page);
	});

	test.afterAll(async () => {
		await deleteRooms(createdRoomIds);
	});

	test('should start a recording from activities recording panel', async ({ page }) => {
		const roomName = `recording_activities_panel_${Date.now()}`;
		const { accessUrl } = await createRoomAndGetAccessUrl(roomName, undefined, undefined, createdRoomIds);
		await openMeeting(page, accessUrl);

		await startStopRecordingFromActivitiesPanel(page, 'start');
		await waitForRecordingStarted(page);
		await expectStopRecordingButtonVisible(page);
		await expectRecordingBadgeVisible(page);
		await startStopRecordingFromActivitiesPanel(page, 'stop');
		await expectStartRecordingButtonVisible(page);
		await expectViewRecordingsButtonVisible(page);

		const newPage = await clickViewRecordingsButton(page);
		await expectViewRecordingsPageOpened(newPage, roomName);
	});

	test('should start a recording from toolbar and open recording panel', async ({ page }) => {
		const roomName = `recording_toolbar_${Date.now()}`;
		const { accessUrl } = await createRoomAndGetAccessUrl(roomName, undefined, undefined, createdRoomIds);
		await openMeeting(page, accessUrl);

		await startStopRecordingFromToolbar(page, 'start');
		await waitForRecordingStarted(page);
		await expectStopRecordingButtonVisible(page);

		await expectRecordingBadgeVisible(page);
		await startStopRecordingFromToolbar(page, 'stop');
		await expectStartRecordingButtonVisible(page);
		await expectViewRecordingsButtonVisible(page);

		const newPage = await clickViewRecordingsButton(page);
		await expectViewRecordingsPageOpened(newPage, roomName);
	});
});
