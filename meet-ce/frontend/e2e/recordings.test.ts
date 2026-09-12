import { MeetRecordingStatus } from '@openvidu-meet/typings';
import { expect, test, type Page } from '@playwright/test';
import {
	createRoomAndGetAnonymousAccessUrl,
	deleteRooms,
	getRoomRecordings,
	requestRecording,
	stopStartingRecording
} from './helpers/meet-api.helper';
import { openMeeting } from './helpers/meeting-navigation.helper';
import {
	clickViewRecordingsButton,
	dismissRecordingNotice,
	expectNoRecordingNotice,
	expectRecordingBadgeStarting,
	expectRecordingBadgeVisible,
	expectRecordingNotice,
	expectRoomRecordingsListShown,
	expectStartRecordingButtonVisible,
	expectStopRecordingButtonVisible,
	expectViewRecordingsButtonVisible,
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
		await expectRecordingNotice(page, 'started');

		await startStopRecordingFromActivitiesPanel(page, 'stop');
		await expectRecordingNotice(page, 'stopped');
		await expectStartRecordingButtonVisible(page);
		await expectViewRecordingsButtonVisible(page);

		const newPage = await clickViewRecordingsButton(page);
		await expectRoomRecordingsListShown(newPage);
	});

	test('should start a recording from toolbar and open recording panel', async ({ page }) => {
		await openMeeting(page, accessUrl);

		await startStopRecordingFromToolbar(page);
		await waitForRecordingStarted(page);
		await expectStopRecordingButtonVisible(page);
		await expectRecordingBadgeVisible(page);
		await expectRecordingNotice(page, 'started');

		await startStopRecordingFromToolbar(page);
		await expectRecordingNotice(page, 'stopped');
		await expectStartRecordingButtonVisible(page);
		await expectViewRecordingsButtonVisible(page);

		const newPage = await clickViewRecordingsButton(page);
		await expectRoomRecordingsListShown(newPage);
	});
	/**
	 * A room whose participants publish nothing keeps the composite recorder waiting for its first
	 * track, so the recording never starts on its own. The only way in is a participant that cannot
	 * publish: media permissions are denied here, and the fake media UI switch that grants them
	 * everywhere else is dropped for this block. The toolbar refuses to record such a room, so the
	 * recording is asked for over the API, the way a host application or an auto-start does.
	 */
	test.describe('a recording that has nothing to record', () => {
		/**
		 * Leaves the participant with no devices to publish, the way a browser does when the camera
		 * and microphone are denied or absent. The suite launches Chrome with fake media granted to
		 * everyone, so the refusal is installed in the page instead of in the browser.
		 */
		const denyMediaAccess = async (page: Page): Promise<void> => {
			await page.addInitScript(() => {
				navigator.mediaDevices.getUserMedia = () =>
					Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
			});
		};

		test('should announce that the recording is waiting for the room to publish something', async ({ page }) => {
			await denyMediaAccess(page);
			await openMeeting(page, accessUrl, { skipPrejoinMediaCheck: true });

			const pendingRequest = requestRecording(roomId);
			pendingRequest.catch(() => {
				// The request outlives the test: it is only answered once the recording starts or gives up
			});

			await expectRecordingNotice(page, 'waiting-for-media');
			await expectRecordingBadgeStarting(page);

			// The transient notices take themselves away after 10s. This one has to stay, because the
			// room is what ends the wait and has to be able to read it.
			await page.waitForTimeout(12_000);
			await expectRecordingNotice(page, 'waiting-for-media', 1_000);

			const [recording] = await getRoomRecordings(roomId);
			expect(recording.status).toBe(MeetRecordingStatus.STARTING);
			expect(recording.startDate).toBeUndefined();

			// Once the recording gives up, what the notice promises cannot happen, so it goes away
			await stopStartingRecording(recording.recordingId);
			await expectNoRecordingNotice(page);
			await pendingRequest.catch(() => {});
		});

		test('should let a moderator stop the recording while it waits, from the panel', async ({ page }) => {
			await denyMediaAccess(page);
			await openMeeting(page, accessUrl, { skipPrejoinMediaCheck: true });

			const pendingRequest = requestRecording(roomId);
			pendingRequest.catch(() => {});

			await expectRecordingNotice(page, 'waiting-for-media');
			await startStopRecordingFromActivitiesPanel(page, 'stop');

			// Nothing was recorded, so the room is told nothing failed: the wait notice goes away
			// and the panel offers to start again
			await expectNoRecordingNotice(page);
			await expectStartRecordingButtonVisible(page);
			await expect
				.poll(async () => (await getRoomRecordings(roomId))[0]?.status)
				.toBe(MeetRecordingStatus.ABORTED);
			await pendingRequest.catch(() => {});
		});

		test('should let a participant close the notice', async ({ page }) => {
			await denyMediaAccess(page);
			await openMeeting(page, accessUrl, { skipPrejoinMediaCheck: true });

			const pendingRequest = requestRecording(roomId);
			pendingRequest.catch(() => {});

			await expectRecordingNotice(page, 'waiting-for-media');
			await dismissRecordingNotice(page);
			await expectNoRecordingNotice(page);

			const [recording] = await getRoomRecordings(roomId);
			await stopStartingRecording(recording.recordingId);
			await pendingRequest.catch(() => {});
		});
	});
});
