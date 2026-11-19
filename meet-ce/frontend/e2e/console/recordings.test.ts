import { MeetRecordingInfo, MeetRoom, MeetRoomMemberRole, MeetUserRole } from '@openvidu-meet/typings';
import { expect, test, type Page } from '@playwright/test';
import { createReadyUser, type ReadyUser } from '../helpers/auth.helper';
import {
	asUser,
	chooseRecordingStatuses,
	cleanupRooms,
	cleanupUsers,
	figure,
	figureCount,
	gotoConsolePage,
	gotoRoomDetail,
	newRunId,
	signInAdminBeforeEach
} from '../helpers/console.helper';
import { createRoom, createRoomMember, MEET_BASE_URL } from '../helpers/meet-api.helper';
import {
	expectRecordingDeletable,
	expectRecordingNotDeletable,
	expectRecordingPlayAndShare,
	recordRoom
} from '../helpers/recordings.helper';

signInAdminBeforeEach();

test.describe('Console Recordings list E2E Tests', () => {
	const emptyList = { recordings: [], pagination: { isTruncated: false, maxItems: 50 } };
	/** The list hides its toolbar and filter panel while it is empty and unfiltered. */
	const oneRecording = {
		recordings: [
			{
				recordingId: 'room--EG_1--x',
				roomId: 'room',
				roomName: 'room',
				status: 'complete',
				startDate: 1_700_000_000_000,
				duration: 10,
				size: 1024
			}
		],
		pagination: { isTruncated: false, maxItems: 50 }
	};

	test('renders the recordings list rather than an error page', async ({ page }) => {
		await gotoConsolePage(page, 'recordings', 'ov-recording-lists');

		await expect(page.locator('.error-page')).toHaveCount(0);
	});

	test('the failed figure filters by its three statuses and clears when selected again', async ({ page }) => {
		const statusesRequested: (string | null)[] = [];
		await page.route('**/internal-api/v1/recordings/summary', (route) =>
			route.fulfill({
				json: { totalRecordings: 5, completeRecordings: 2, recordingsInProgress: 1, failedRecordings: 2 }
			})
		);
		await page.route('**/api/v1/recordings?*', (route) => {
			statusesRequested.push(new URL(route.request().url()).searchParams.get('status'));
			return route.fulfill({ json: emptyList });
		});
		await gotoConsolePage(page, 'recordings', 'ov-recording-lists');
		await expect(figureCount(page, 'failed')).toHaveText('2');

		await figure(page, 'failed').click();

		await expect(figure(page, 'failed')).toHaveAttribute('aria-pressed', 'true');
		await expect(page).toHaveURL(/status=failed,aborted,limit_reached/);
		await expect.poll(() => statusesRequested.at(-1)).toBe('failed,aborted,limit_reached');
		await expect(page.locator('.ov-active-filters .filter-chip')).toContainText('Failed, Aborted, Limit Reached');

		await figure(page, 'failed').click();

		await expect(figure(page, 'all')).toHaveAttribute('aria-pressed', 'true');
		await expect.poll(() => statusesRequested.at(-1)).toBeNull();
	});

	test('choosing several statuses in the status filter lists them all', async ({ page }) => {
		const statusesRequested: (string | null)[] = [];
		await page.route('**/api/v1/recordings?*', (route) => {
			statusesRequested.push(new URL(route.request().url()).searchParams.get('status'));
			return route.fulfill({ json: oneRecording });
		});
		await gotoConsolePage(page, 'recordings', 'ov-recording-lists');

		await chooseRecordingStatuses(page, ['Failed', 'Aborted']);

		await expect.poll(() => statusesRequested.at(-1)).toBe('failed,aborted');
		await expect(page).toHaveURL(/status=failed,aborted/);
	});

	test('on a phone the figures are one card whose chips filter the list', async ({ page }) => {
		const statusesRequested: (string | null)[] = [];
		await page.route('**/internal-api/v1/recordings/summary', (route) =>
			route.fulfill({
				json: { totalRecordings: 5, completeRecordings: 2, recordingsInProgress: 1, failedRecordings: 2 }
			})
		);
		await page.route('**/api/v1/recordings?*', (route) => {
			statusesRequested.push(new URL(route.request().url()).searchParams.get('status'));
			return route.fulfill({ json: emptyList });
		});
		await page.setViewportSize({ width: 390, height: 844 });
		await gotoConsolePage(page, 'recordings', 'ov-recording-lists');

		await expect(page.locator('ov-list-figures .tile')).toHaveCount(0);
		await expect(page.locator('ov-list-figures .card-total-count')).toHaveText('5');
		await expect(page.locator('ov-list-figures .bar .segment')).toHaveCount(3);
		await expect(page.locator('ov-list-figures .card-chip')).toHaveCount(4);
		await expect(figure(page, 'all')).toHaveAttribute('aria-pressed', 'true');

		await figure(page, 'failed').click();

		await expect(figure(page, 'failed')).toHaveAttribute('aria-pressed', 'true');
		await expect.poll(() => statusesRequested.at(-1)).toBe('failed,aborted,limit_reached');

		await figure(page, 'all').click();

		await expect(figure(page, 'all')).toHaveAttribute('aria-pressed', 'true');
		await expect.poll(() => statusesRequested.at(-1)).toBeNull();
	});

	test('shows no figures when there is nothing to count or the figures cannot be read', async ({ page }) => {
		await page.route('**/api/v1/recordings?*', (route) => route.fulfill({ json: emptyList }));
		await page.route('**/internal-api/v1/recordings/summary', (route) =>
			route.fulfill({
				json: { totalRecordings: 0, completeRecordings: 0, recordingsInProgress: 0, failedRecordings: 0 }
			})
		);
		await gotoConsolePage(page, 'recordings', 'ov-recording-lists');
		await expect(page.locator('ov-list-figures')).toHaveCount(0);

		await page.unroute('**/internal-api/v1/recordings/summary');
		await page.route('**/internal-api/v1/recordings/summary', (route) =>
			route.fulfill({ status: 500, body: '{}' })
		);
		await page.reload();

		await expect(page.locator('ov-recording-lists')).toBeVisible({ timeout: 20_000 });
		await expect(page.locator('ov-list-figures')).toHaveCount(0);
	});
});

test.describe('Console Recordings page by permission E2E Tests', () => {
	const RUN_ID = newRunId();
	let room: MeetRoom;
	let recording: MeetRecordingInfo;
	let viewer: ReadyUser;
	let listener: ReadyUser;

	const recordingRow = (page: Page) => page.locator(`[id="table-row-${recording.recordingId}"]`);

	test.beforeAll(async ({ browser }) => {
		room = await createRoom({ roomName: `${RUN_ID}-recorded` });
		const [viewerCreated, listenerCreated] = await Promise.all([
			createReadyUser('Console viewer', MeetUserRole.ROOM_MEMBER),
			createReadyUser('Console listener', MeetUserRole.ROOM_MEMBER)
		]);
		viewer = viewerCreated.user;
		listener = listenerCreated.user;
		await createRoomMember(room.roomId, { userId: viewer.userId, baseRole: MeetRoomMemberRole.SPEAKER });
		await createRoomMember(room.roomId, {
			userId: listener.userId,
			baseRole: MeetRoomMemberRole.SPEAKER,
			customPermissions: { recordingPlay: false }
		});
		recording = await recordRoom(browser, room.roomId);
	});

	test.afterAll(async () => {
		await cleanupRooms([room.roomId]);
		await cleanupUsers([viewer.userId, listener.userId]);
	});

	test('an admin sees the recording with download and delete offered', async ({ page }) => {
		await gotoConsolePage(page, 'recordings', 'ov-recording-lists');

		await expect(recordingRow(page)).toBeVisible({ timeout: 20_000 });
		await expect(page.locator(`[id="download-recording-btn-${recording.recordingId}"]`)).toBeEnabled();
		await expectRecordingDeletable(page, recording.recordingId);
	});

	test('clicking the row of a recording opens it, while a button in the row does not', async ({ page }) => {
		await gotoConsolePage(page, 'recordings', 'ov-recording-lists');
		await expect(recordingRow(page)).toBeVisible({ timeout: 20_000 });

		await page.locator(`[id="more-actions-btn-${recording.recordingId}"]`).click();
		await expect(page.locator(`[id="delete-recording-btn-${recording.recordingId}"]`)).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(page).toHaveURL(/\/recordings$/);

		await recordingRow(page).locator('.room-name').click();

		await expect(page).toHaveURL(new RegExp(`/recordings/${recording.recordingId}$`));
		await expect(page.locator('ov-recording-detail')).toBeVisible({ timeout: 20_000 });
	});

	test('going back from a recording restores the filter and reloads the list', async ({ page }) => {
		await gotoConsolePage(page, 'recordings', 'ov-recording-lists');
		await chooseRecordingStatuses(page, ['Complete']);
		await expect(page).toHaveURL(/status=complete/);
		await recordingRow(page).locator('.room-name').click();
		await expect(page.locator('ov-recording-detail')).toBeVisible({ timeout: 20_000 });
		const reload = page.waitForRequest((request) => /\/api\/v1\/recordings\?/.test(request.url()));

		await page.goBack();

		await reload;
		await expect(page).toHaveURL(/status=complete/);
		await expect(page.locator('ov-recording-lists .ov-active-filters .filter-chip')).toContainText('Complete');
		await expect(recordingRow(page)).toBeVisible({ timeout: 20_000 });
	});

	test('a member without recordingDelete lists the recording without delete, and its room id opens the room', async ({
		browser
	}) => {
		await asUser(browser, viewer, async (page) => {
			await gotoConsolePage(page, 'recordings', 'ov-recording-lists');

			await expect(recordingRow(page)).toBeVisible({ timeout: 20_000 });
			await expectRecordingNotDeletable(page, recording.recordingId);
			await expect(page.locator(`[id="download-recording-btn-${recording.recordingId}"]`)).toBeEnabled();

			await recordingRow(page).locator('a.room-id').click();

			await expect(page.locator('ov-room-detail')).toBeVisible({ timeout: 20_000 });
			await expect(page).toHaveURL(new RegExp(`/rooms/${room.roomId}$`));
		});
	});

	test('a member without recordingPlay has play and share disabled, with a tooltip naming the permission', async ({
		browser
	}) => {
		await asUser(browser, listener, async (page) => {
			await gotoConsolePage(page, 'recordings', 'ov-recording-lists');
			await expect(recordingRow(page)).toBeVisible({ timeout: 20_000 });

			await expectRecordingPlayAndShare(page, recording.recordingId, false);
			await page.locator(`[id="play-recording-btn-${recording.recordingId}"]`).locator('..').hover();
			await expect(page.locator('.mat-mdc-tooltip')).toContainText('recordingPlay');

			await gotoRoomDetail(page, room.roomId);
			await expectRecordingPlayAndShare(page, recording.recordingId, false);
		});
	});

	test('the detail of a recording the user may not play returns to the Recordings page', async ({ browser }) => {
		await asUser(browser, listener, async (page) => {
			await page.goto(`${MEET_BASE_URL}/recordings/${recording.recordingId}`, { waitUntil: 'domcontentloaded' });

			await expect(page).toHaveURL(/\/recordings$/, { timeout: 20_000 });
			await expect(page.locator('ov-recording-lists')).toBeVisible({ timeout: 20_000 });
		});
	});
});
