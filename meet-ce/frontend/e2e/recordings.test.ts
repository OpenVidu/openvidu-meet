import { test } from '@playwright/test';
import { createRoomAndGetAnonymousAccessUrl, deleteRooms } from './helpers/meet-api.helper';
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
	const createdRoomIds = new Set<string>();

	test.afterEach(async ({ page }) => {
		await leaveMeeting(page);
	});

	test.afterAll(async () => {
		await deleteRooms(createdRoomIds);
	});

	test('should start a recording from activities recording panel', async ({ page }) => {
		const { room, accessUrl } = await createRoomAndGetAnonymousAccessUrl();
		createdRoomIds.add(room.roomId);
		await openMeeting(page, accessUrl);

		await startStopRecordingFromActivitiesPanel(page, 'start');
		await waitForRecordingStarted(page);
		await expectStopRecordingButtonVisible(page);
		await expectRecordingBadgeVisible(page);

		await startStopRecordingFromActivitiesPanel(page, 'stop');
		await expectStartRecordingButtonVisible(page);
		await expectViewRecordingsButtonVisible(page);

		const newPage = await clickViewRecordingsButton(page);
		await expectViewRecordingsPageOpened(newPage, room.roomId);
	});

	test('should start a recording from toolbar and open recording panel', async ({ page }) => {
		const { room, accessUrl } = await createRoomAndGetAnonymousAccessUrl();
		createdRoomIds.add(room.roomId);
		await openMeeting(page, accessUrl);

		await startStopRecordingFromToolbar(page);
		await waitForRecordingStarted(page);
		await expectStopRecordingButtonVisible(page);
		await expectRecordingBadgeVisible(page);

		await startStopRecordingFromToolbar(page);
		await expectStartRecordingButtonVisible(page);
		await expectViewRecordingsButtonVisible(page);

		const newPage = await clickViewRecordingsButton(page);
		await expectViewRecordingsPageOpened(newPage, room.roomId);
	});
});
