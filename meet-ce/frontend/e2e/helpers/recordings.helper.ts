import { expect, type Page } from '@playwright/test';
import { openMoreOptionsMenu, toggleActivitiesPanel } from './panels.helper';
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
export const ensureActivitiesPanelOpen = async (page: Page): Promise<void> => {
	if (!(await page.locator(ACTIVITIES_CONTAINER).isVisible())) {
		await toggleActivitiesPanel(page);
	}
};

/**
 * Ensures the recording activity expansion panel is expanded, opening the
 * activities panel first if needed.
 */
export const ensureRecordingActivityExpanded = async (page: Page): Promise<void> => {
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
 * Returns the current recording status text, trimmed and uppercased.
 */
export const getRecordingStatusText = async (page: Page): Promise<string> => {
	const status = await page.locator(RECORDING_STATUS).first().innerText();
	return status.trim().toUpperCase();
};

/**
 * Polls until the recording status element shows {@link expectedStatus}.
 */
export const expectRecordingStatus = async (
	page: Page,
	expectedStatus: 'STARTING' | 'STARTED',
	timeoutMs = 20_000
): Promise<void> => {
	await expect.poll(() => getRecordingStatusText(page), { timeout: timeoutMs }).toBe(expectedStatus);
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
 * Asserts that the activities panel is open and the recording is in the
 * `STARTING` state.
 */
export const expectActivitiesPanelOpenedWithRecordingStarting = async (
	page: Page,
	timeoutMs = 20_000
): Promise<void> => {
	await expect(page.locator(ACTIVITIES_CONTAINER)).toBeVisible({ timeout: timeoutMs });
	await expect(page.locator(RECORDING_ACTIVITY)).toBeVisible({ timeout: timeoutMs });
	await expectRecordingStatus(page, 'STARTING', timeoutMs);
};

/**
 * Asserts that the stop-recording button is visible within the recording activity panel.
 */
export const expectStopRecordingButtonVisible = async (page: Page, timeoutMs = 10_000): Promise<void> => {
	await expectVisible(page, RECORDING_ACTIVITY);
	await expect(page.locator(STOP_RECORDING_BUTTON)).toBeVisible({ timeout: timeoutMs });
};

/**
 * Asserts that the start-recording button is visible within the recording activity panel.
 */
export const expectStartRecordingButtonVisible = async (page: Page, timeoutMs = 10_000): Promise<void> => {
	await expectVisible(page, RECORDING_ACTIVITY);
	await expect(page.locator(START_RECORDING_BUTTON)).toBeVisible({ timeout: timeoutMs });
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
 * Asserts that the "view recordings" button is visible.
 */
export const expectViewRecordingsButtonVisible = async (page: Page, timeoutMs = 10_000): Promise<void> => {
	await expect(page.locator(VIEW_RECORDINGS_BUTTON)).toBeVisible({ timeout: timeoutMs });
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
 * Stops the active recording and waits for the activities panel to confirm
 * the recording has ended.
 */
export const stopRecordingAndOpenActivitiesPanel = async (page: Page): Promise<void> => {
	await stopRecordingIfActive(page);
	await expectActivitiesPanelOpenedWithRecording(page);
};

/**
 * Asserts the browser navigated to the recordings listing page for {@link roomId}.
 */
export const expectViewRecordingsPageOpened = async (page: Page, roomId: string, timeoutMs = 5_000): Promise<void> => {
	await expect(page).toHaveURL(new RegExp(`/meet/room/${roomId}/recordings`), { timeout: timeoutMs });
};

/**
 * Asserts that the activities panel is open and contains the recording activity
 * with a visible status element.
 */
export const expectActivitiesPanelOpenedWithRecording = async (page: Page, timeoutMs = 10_000): Promise<void> => {
	await expect(page.locator(ACTIVITIES_CONTAINER)).toBeVisible({ timeout: timeoutMs });
	await expect(page.locator(RECORDING_ACTIVITY)).toBeVisible({ timeout: timeoutMs });
	await expect(page.locator(RECORDING_STATUS)).toBeVisible({ timeout: timeoutMs });
};
