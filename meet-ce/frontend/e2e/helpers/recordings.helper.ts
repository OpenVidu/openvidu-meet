import { MeetRecordingInfo, MeetRecordingStatus, MeetRoomMemberRole } from '@openvidu-meet/typings';
import { expect, type Browser, type Page } from '@playwright/test';
import { getRoomRecordings } from './meet-api.helper';
import { openMoreOptionsMenu, toggleActivitiesPanel } from './panels.helper';
import { joinParticipants } from './participant-management.helper';
import { expectVisible } from './ui-utils.helper';

const ACTIVITIES_CONTAINER = '#activities-container';
const RECORDING_ACTIVITY = '#recording-activity';
const RECORDING_STATUS = '#recording-status';
const START_RECORDING_BUTTON = '#start-recording-btn';
const STOP_RECORDING_BUTTON = '#stop-recording-btn';
const VIEW_RECORDINGS_BUTTON = '#view-recordings-btn';
const SETTINGS_RECORDING_BUTTON = '#recording-btn';
const RECORDING_TAG = '#recording-tag';

/**
 * Ensures the activities panel is open, toggling it if currently closed.
 */
const ensureActivitiesPanelOpen = async (page: Page): Promise<void> => {
	if (!(await page.locator(ACTIVITIES_CONTAINER).isVisible())) {
		await toggleActivitiesPanel(page);
	}
};

/**
 * Ensures the recording activity expansion panel is expanded, opening the
 * activities panel first if needed.
 */
const ensureRecordingActivityExpanded = async (page: Page): Promise<void> => {
	await ensureActivitiesPanelOpen(page);
	await expectVisible(page, RECORDING_ACTIVITY);

	const startButton = page.locator(START_RECORDING_BUTTON);
	const stopButton = page.locator(STOP_RECORDING_BUTTON);
	const hasAnyControlVisible = (await startButton.isVisible()) || (await stopButton.isVisible());

	if (!hasAnyControlVisible) {
		await page.locator(`${RECORDING_ACTIVITY} mat-expansion-panel-header`).click();
	}
};

/**
 * Starts or stops a recording from the activities panel.
 * Opens and expands the recording activity panel if needed.
 */
export const startStopRecordingFromActivitiesPanel = async (page: Page, action: 'start' | 'stop'): Promise<void> => {
	await ensureRecordingActivityExpanded(page);

	const button = page.locator(action === 'start' ? START_RECORDING_BUTTON : STOP_RECORDING_BUTTON);
	await expect(button).toBeVisible();
	await expect(button).toBeEnabled();
	await button.click();
};

/**
 * Starts or stops a recording from the toolbar's more-options menu.
 * Asserts the activities panel and recording activity are visible afterwards.
 */
export const startStopRecordingFromToolbar = async (page: Page): Promise<void> => {
	await openMoreOptionsMenu(page);

	const recordingButton = page.locator(SETTINGS_RECORDING_BUTTON).first();
	await expect(recordingButton).toBeVisible();
	await expect(recordingButton).toBeEnabled();
	await recordingButton.click();
	await expectVisible(page, ACTIVITIES_CONTAINER);
	await expectVisible(page, RECORDING_ACTIVITY);
};

/**
 * Stops the recording if one is currently active, waiting for the `STOPPED`
 * status. Does nothing if no recording is running.
 */
export const stopRecordingIfActive = async (page: Page): Promise<void> => {
	await ensureRecordingActivityExpanded(page);

	const stopButton = page.locator(STOP_RECORDING_BUTTON);

	if (await stopButton.isVisible()) {
		await stopButton.click();
		await expect.poll(() => getRecordingStatusText(page), { timeout: 45_000 }).toBe('STOPPED');
	}
};

/**
 * Returns the current recording status text, trimmed and uppercased.
 */
const getRecordingStatusText = async (page: Page): Promise<string> => {
	const status = await page.locator(RECORDING_STATUS).first().innerText();
	return status.trim().toUpperCase();
};

/**
 * Polls until the recording reaches the `STARTED` state.
 * Throws immediately if the status transitions to `FAILED`.
 */
export const waitForRecordingStarted = async (page: Page, timeoutMs = 40_000): Promise<void> => {
	await expect
		.poll(
			async () => {
				const status = await getRecordingStatusText(page);

				if (status === 'FAILED') {
					const errorMessage = await page
						.locator(`${RECORDING_ACTIVITY} .error-message`)
						.first()
						.innerText()
						.catch(() => 'unknown recording error');
					throw new Error(`Recording transitioned to FAILED: ${errorMessage}`);
				}

				return status;
			},
			{
				timeout: timeoutMs,
				message: `Recording did not reach STARTED within ${timeoutMs}ms. If it remains STARTING, verify recording egress service availability in the test environment.`
			}
		)
		.toBe('STARTED');
};

/**
 * Asserts that the start-recording button is visible within the recording activity panel.
 */
export const expectStartRecordingButtonVisible = async (page: Page, timeoutMs = 10_000): Promise<void> => {
	await expectVisible(page, RECORDING_ACTIVITY);
	await expect(page.locator(START_RECORDING_BUTTON)).toBeVisible({ timeout: timeoutMs });
};

/**
 * Asserts that the stop-recording button is visible within the recording activity panel.
 */
export const expectStopRecordingButtonVisible = async (page: Page, timeoutMs = 10_000): Promise<void> => {
	await expectVisible(page, RECORDING_ACTIVITY);
	await expect(page.locator(STOP_RECORDING_BUTTON)).toBeVisible({ timeout: timeoutMs });
};

/**
 * Asserts that the recording control is available in the toolbar's more-options menu
 * (`canRecord` granted). Leaves the menu open on success is avoided — the menu is closed afterwards.
 */
export const expectRecordButtonAvailable = async (page: Page): Promise<void> => {
	await openMoreOptionsMenu(page);
	await expect(page.locator(SETTINGS_RECORDING_BUTTON).first()).toBeVisible({ timeout: 10_000 });
	await page.keyboard.press('Escape');
};

/**
 * Asserts that the recording control is not available in the toolbar's more-options menu
 * (`canRecord` denied).
 */
export const expectNoRecordButton = async (page: Page): Promise<void> => {
	await openMoreOptionsMenu(page);
	await expect(page.locator(SETTINGS_RECORDING_BUTTON)).toHaveCount(0);
	await page.keyboard.press('Escape');
};

/**
 * Asserts that the recording badge is visible and displays a `REC | H:MM:SS` timer.
 */
export const expectRecordingBadgeVisible = async (page: Page, timeoutMs = 30_000): Promise<void> => {
	const recordingTag = page.locator(RECORDING_TAG);
	await expect(recordingTag).toContainText('REC', { timeout: timeoutMs });
	await expect
		.poll(async () => (await recordingTag.innerText()).replace(/\s+/g, ' ').trim(), { timeout: timeoutMs })
		.toMatch(/REC\s*\|\s*\d{1,2}:\d{2}:\d{2}/);
};

/**
 * Asserts that the "view recordings" button is visible.
 */
export const expectViewRecordingsButtonVisible = async (page: Page, timeoutMs = 10_000): Promise<void> => {
	await expect(page.locator(VIEW_RECORDINGS_BUTTON)).toBeVisible({ timeout: timeoutMs });
};

/**
 * Asserts that the "view recordings" control is available in the toolbar's more-options menu
 * (`canRetrieveRecordings` granted, on a room that has recordings). Opens and closes the menu.
 */
export const expectViewRecordingsButtonAvailable = async (page: Page): Promise<void> => {
	await openMoreOptionsMenu(page);
	await expect(page.locator(VIEW_RECORDINGS_BUTTON).first()).toBeVisible({ timeout: 10_000 });
	await page.keyboard.press('Escape');
};

/**
 * Asserts that the "view recordings" control is not available in the toolbar's more-options menu
 * (`canRetrieveRecordings` denied). Opens and closes the menu.
 */
export const expectNoViewRecordingsButton = async (page: Page): Promise<void> => {
	await openMoreOptionsMenu(page);
	await expect(page.locator(VIEW_RECORDINGS_BUTTON)).toHaveCount(0);
	await page.keyboard.press('Escape');
};

/**
 * Clicks the "view recordings" button and returns the newly opened page.
 */
export const clickViewRecordingsButton = async (page: Page): Promise<Page> => {
	await expectViewRecordingsButtonVisible(page);
	const [newPage] = await Promise.all([
		page.context().waitForEvent('page'),
		page.locator(VIEW_RECORDINGS_BUTTON).click()
	]);
	return newPage;
};

/**
 * Records the given room end-to-end through the UI and returns the completed recording: a moderator
 * joins to make the room active, the recording is started and stopped from the activities panel, and
 * the helper waits until it reaches COMPLETE. The REST API is used only to read back the resulting
 * {@link MeetRecordingInfo} — never to start/stop the recording. Requires the recording egress
 * service to be available in the environment.
 */
export const recordRoom = async (browser: Browser, roomId: string): Promise<MeetRecordingInfo> => {
	const { pages, removeAllParticipants } = await joinParticipants(browser, {
		roomId,
		participants: [{ name: 'Recorder', baseRole: MeetRoomMemberRole.MODERATOR }]
	});
	const [recorderPage] = pages;

	try {
		await startStopRecordingFromActivitiesPanel(recorderPage, 'start');
		await waitForRecordingStarted(recorderPage);
		await stopRecordingIfActive(recorderPage);

		await expect
			.poll(
				async () => (await getRoomRecordings(roomId)).some((r) => r.status === MeetRecordingStatus.COMPLETE),
				{ timeout: 30_000, message: 'Recording did not reach COMPLETE after being stopped' }
			)
			.toBeTruthy();

		const recording = (await getRoomRecordings(roomId)).find((r) => r.status === MeetRecordingStatus.COMPLETE);

		if (!recording) {
			throw new Error(`No completed recording found for room ${roomId}`);
		}

		return recording;
	} finally {
		await removeAllParticipants();
	}
};

// ─── Recordings list: view + delete-permission assertions ──────────────────────

/**
 * Asserts that the room recordings list page is shown (access was granted — the list renders rather
 * than the error page). Optionally also asserts the given recording is listed.
 */
export const expectRoomRecordingsListShown = async (page: Page, recordingId?: string): Promise<void> => {
	await expect(page.locator('ov-recording-lists')).toBeVisible({ timeout: 15_000 });
	await expect(page.locator('.error-page')).toHaveCount(0);

	if (recordingId) {
		await expect(page.locator(`[id="play-recording-btn-${recordingId}"]`).first()).toBeVisible({
			timeout: 15_000
		});
	}
};

/**
 * Asserts that the given recording can be deleted from the recordings list — the more-actions menu
 * exposes the delete action (requires `canDeleteRecordings`).
 */
export const expectRecordingDeletable = async (page: Page, recordingId: string): Promise<void> => {
	const moreActionsButton = page.locator(`[id="more-actions-btn-${recordingId}"]`);
	await expect(moreActionsButton).toBeVisible({ timeout: 15_000 });
	await moreActionsButton.click();
	await expect(page.locator(`[id="delete-recording-btn-${recordingId}"]`)).toBeVisible({ timeout: 10_000 });
	await page.keyboard.press('Escape');
};

/**
 * Asserts that the given recording is listed (share is available) but cannot be deleted — no
 * more-actions menu / delete action is rendered when `canDeleteRecordings` is false.
 */
export const expectRecordingNotDeletable = async (page: Page, recordingId: string): Promise<void> => {
	await expect(page.locator(`[id="share-recording-link-${recordingId}"]`)).toBeVisible({ timeout: 15_000 });
	await expect(page.locator(`[id="more-actions-btn-${recordingId}"]`)).toHaveCount(0);
	await expect(page.locator(`[id="delete-recording-btn-${recordingId}"]`)).toHaveCount(0);
};

// ─── Individual recording view: view + delete-permission assertions ─────────────

/**
 * Asserts that the individual recording view is shown (access was granted — the video player
 * renders rather than the error page).
 */
export const expectRecordingViewShown = async (page: Page): Promise<void> => {
	await expect(page.locator('ov-recording-video-player').first()).toBeVisible({ timeout: 15_000 });
	await expect(page.locator('.error-page')).toHaveCount(0);
};

/**
 * Asserts that the individual recording view is loaded and shows the delete action
 * (`canDeleteRecordings`).
 */
export const expectViewRecordingDeletable = async (page: Page): Promise<void> => {
	await expect(page.locator('.icon-action-btn.delete-btn').first()).toBeVisible({ timeout: 15_000 });
};

/**
 * Asserts that the individual recording view is loaded (the player renders) but the delete action
 * is absent.
 */
export const expectViewRecordingNotDeletable = async (page: Page): Promise<void> => {
	await expect(page.locator('ov-recording-video-player').first()).toBeVisible({ timeout: 15_000 });
	await expect(page.locator('.icon-action-btn.delete-btn')).toHaveCount(0);
};

// ─── Recording share dialog: generate a public URL ──────────────────────────────

const SHARE_DIALOG = 'ov-share-recording-dialog';

/**
 * Opens the recording share dialog from the recordings list (per-recording share button). When the
 * user can delete recordings the share button is nested in the per-recording more-actions menu
 * (rendered only once opened), so the menu is opened first when present.
 */
export const openShareDialogFromList = async (page: Page, recordingId: string): Promise<void> => {
	const moreActions = page.locator(`[id="more-actions-btn-${recordingId}"]`).first();
	if (await moreActions.isVisible().catch(() => false)) {
		await moreActions.click({ timeout: 15_000 });
	}
	await page.locator(`[id="share-recording-link-${recordingId}"]`).first().click({ timeout: 15_000 });
	await expect(page.locator(SHARE_DIALOG)).toBeVisible({ timeout: 10_000 });
};

/**
 * Opens the recording share dialog from the individual recording view. The share control has no
 * stable id and its class differs across responsive layouts, so it is matched by its `share` icon.
 */
export const openShareDialogFromRecordingView = async (page: Page): Promise<void> => {
	await page.locator('button:has(mat-icon:text-is("share"))').first().click({ timeout: 15_000 });
	await expect(page.locator(SHARE_DIALOG)).toBeVisible({ timeout: 10_000 });
};

/**
 * From an open share dialog, requests a public recording URL. `public` is the default access type
 * and is enabled because the shared room allows anonymous recording access; the request is
 * room-scoped (carries the room member token), so it drives the refresh cascade when tokens expire.
 *
 * Opening the dialog fires a room-access lookup that enables the public option — which, on an expired
 * room member token, itself triggers (and transparently recovers) the cascade. We wait for that
 * lookup to settle (public option enabled) before requesting the URL to avoid a race.
 */
export const generatePublicRecordingUrl = async (page: Page): Promise<void> => {
	const dialog = page.locator(SHARE_DIALOG);
	await expect(dialog.locator('mat-radio-button[value="public"]')).not.toHaveClass(/access-disabled/, {
		timeout: 15_000
	});
	await dialog.locator('.generate-button').click({ timeout: 10_000 });
};

/**
 * Asserts the share dialog produced a recording URL (the generate request succeeded / recovered).
 */
export const expectPublicRecordingUrlGenerated = async (page: Page): Promise<void> => {
	await expect(page.locator(`${SHARE_DIALOG} .url-input`)).toBeVisible({ timeout: 15_000 });
};
