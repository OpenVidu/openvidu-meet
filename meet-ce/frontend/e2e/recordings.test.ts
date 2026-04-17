import { test } from '@playwright/test';
import { createRoomAndGetAccessUrl, deleteRooms } from './helpers/meet-api.helper';
import { leaveMeeting, openMeeting } from './helpers/meeting-ui.helper';
import {
	expectRecordingTagTimerBadge,
	startRecordingFromActivitiesPanel,
	startRecordingFromSettingsMenu,
	stopRecordingIfActive,
	waitForRecordingStarted
} from './helpers/recordings.helper';

test.describe('Recordings: E2E UI flows', () => {
	test.describe.configure({ timeout: 120_000 });
	const createdRoomIds = new Set<string>();

	test.afterEach(async ({ page }) => {
		await stopRecordingIfActive(page);
		await leaveMeeting(page);
	});

	test.afterAll(async () => {
		await deleteRooms(createdRoomIds);
	});

	async function createTrackedAccessUrl(participantName: string): Promise<string> {
		const { accessUrl } = await createRoomAndGetAccessUrl(participantName, undefined, undefined, createdRoomIds);
		return accessUrl;
	}

	test('should start a recording from activities recording panel', async ({ page }) => {
		const accessUrl = await createTrackedAccessUrl(`recording-activities-${Date.now()}`);
		await openMeeting(page, accessUrl);

		await startRecordingFromActivitiesPanel(page);
		await waitForRecordingStarted(page);
		await expectRecordingTagTimerBadge(page);
	});

	test('should start a recording from settings panel', async ({ page }) => {
		const accessUrl = await createTrackedAccessUrl(`recording-settings-${Date.now()}`);
		await openMeeting(page, accessUrl);

		await startRecordingFromSettingsMenu(page);
		await waitForRecordingStarted(page);
	});
});
