import { test } from '@playwright/test';
import { createRoomAndGetAnonymousAccessUrl, deleteRooms } from './helpers/meet-api.helper';
import { openMeeting } from './helpers/meeting-navigation.helper';
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

test.describe('Recordings E2E Tests', () => {
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

	test('should start a recording from activities recording panel', async ({ page }) => {
		await openMeeting(page, accessUrl);

		await startStopRecordingFromActivitiesPanel(page, 'start');
		await waitForRecordingStarted(page);
		await expectStopRecordingButtonVisible(page);
		await expectRecordingBadgeVisible(page);

		await startStopRecordingFromActivitiesPanel(page, 'stop');
		await expectStartRecordingButtonVisible(page);
		await expectViewRecordingsButtonVisible(page);

		const newPage = await clickViewRecordingsButton(page);
		await expectViewRecordingsPageOpened(newPage, roomId);
	});

	test('should start a recording from toolbar and open recording panel', async ({ page }) => {
		await openMeeting(page, accessUrl);

		await startStopRecordingFromToolbar(page);
		await waitForRecordingStarted(page);
		await expectStopRecordingButtonVisible(page);
		await expectRecordingBadgeVisible(page);

		await startStopRecordingFromToolbar(page);
		await expectStartRecordingButtonVisible(page);
		await expectViewRecordingsButtonVisible(page);

		const newPage = await clickViewRecordingsButton(page);
		await expectViewRecordingsPageOpened(newPage, roomId);
	});
});
