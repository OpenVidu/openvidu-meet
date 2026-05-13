import { expect, type Page } from '@playwright/test';
import { expectVisible, toggleActivitiesPanel } from './meeting-ui.helper';

const ACTIVITIES_CONTAINER = '#activities-container';
const RECORDING_ACTIVITY = '#recording-activity';
const RECORDING_STATUS = '#recording-status';
const START_RECORDING_BUTTON = '#start-recording-btn';
const STOP_RECORDING_BUTTON = '#stop-recording-btn';
const VIEW_RECORDINGS_BUTTON = '#view-recordings-btn';
const MORE_OPTIONS_BUTTON = '#more-options-btn';
const SETTINGS_RECORDING_BUTTON = '#recording-btn';
const RECORDING_TAG = '#recording-tag';

const isVisible = async (page: Page, selector: string): Promise<boolean> => {
	const locator = page.locator(selector);
	return (
		(await locator.count()) > 0 &&
		(await locator
			.first()
			.isVisible()
			.catch(() => false))
	);
};

export const ensureActivitiesPanelOpen = async (page: Page): Promise<void> => {
	if (!(await isVisible(page, ACTIVITIES_CONTAINER))) {
		await toggleActivitiesPanel(page);
	}
};

export const openMoreOptionsMenu = async (page: Page): Promise<void> => {
	await page.locator(MORE_OPTIONS_BUTTON).click();
	await expect(
		page.locator(`${SETTINGS_RECORDING_BUTTON}:visible, #toolbar-settings-btn:visible`).first()
	).toBeVisible();
};

export const ensureRecordingActivityExpanded = async (page: Page): Promise<void> => {
	await ensureActivitiesPanelOpen(page);

	await expectVisible(page, RECORDING_ACTIVITY);
	await expectVisible(page, RECORDING_ACTIVITY);

	const startButton = page.locator(START_RECORDING_BUTTON);
	const stopButton = page.locator(STOP_RECORDING_BUTTON);
	const hasAnyControlVisible =
		(await startButton
			.first()
			.isVisible()
			.catch(() => false)) ||
		(await stopButton
			.first()
			.isVisible()
			.catch(() => false));

	if (!hasAnyControlVisible) {
		await page.locator(`${RECORDING_ACTIVITY} mat-expansion-panel-header`).click();
	}
};

export const startStopRecordingFromActivitiesPanel = async (page: Page, action: 'start' | 'stop'): Promise<void> => {
	await ensureRecordingActivityExpanded(page);

	const button = page.locator(action === 'start' ? START_RECORDING_BUTTON : STOP_RECORDING_BUTTON);

	await expect(button).toBeVisible();
	await expect(button).toBeEnabled();
	await button.click();
};

export const startStopRecordingFromToolbar = async (page: Page): Promise<void> => {
	await openMoreOptionsMenu(page);

	const recordingButton = page.locator(`${SETTINGS_RECORDING_BUTTON}:visible`).first();
	await expect(recordingButton).toBeVisible();
	await expect(recordingButton).toBeEnabled();
	await recordingButton.click();
	await expectVisible(page, ACTIVITIES_CONTAINER);
	await expectVisible(page, RECORDING_ACTIVITY);
};

export const getRecordingStatusText = async (page: Page): Promise<string> => {
	const status = await page.locator(RECORDING_STATUS).first().innerText();
	return status.trim().toUpperCase();
};

export const expectRecordingStatus = async (
	page: Page,
	expectedStatus: 'STARTING' | 'STARTED',
	timeoutMs = 20_000
): Promise<void> => {
	await expect.poll(async () => await getRecordingStatusText(page), { timeout: timeoutMs }).toBe(expectedStatus);
};

export const waitForRecordingStarted = async (page: Page, timeoutMs = 40_000): Promise<void> => {
	const deadline = Date.now() + timeoutMs;

	while (Date.now() < deadline) {
		const status = await getRecordingStatusText(page);

		if (status === 'STARTED') {
			return;
		}

		if (status === 'FAILED') {
			const errorMessage = await page
				.locator('#recording-activity .error-message')
				.first()
				.innerText()
				.catch(() => 'unknown recording error');
			throw new Error(`Recording transitioned to FAILED: ${errorMessage}`);
		}

		await page.waitForTimeout(500);
	}

	const lastStatus = await getRecordingStatusText(page);
	throw new Error(
		`Recording did not reach STARTED within ${timeoutMs}ms (last status: ${lastStatus}). ` +
			'If it remains STARTING, verify recording egress service availability in the test environment.'
	);
};

export const expectActivitiesPanelOpenedWithRecordingStarting = async (
	page: Page,
	timeoutMs = 20_000
): Promise<void> => {
	await expect(page.locator(ACTIVITIES_CONTAINER)).toBeVisible({ timeout: timeoutMs });
	await expect(page.locator(RECORDING_ACTIVITY)).toBeVisible({ timeout: timeoutMs });
	await expectRecordingStatus(page, 'STARTING', timeoutMs);
};

export const expectStopRecordingButtonVisible = async (page: Page, timeoutMs = 10_000): Promise<void> => {
	await expectVisible(page, RECORDING_ACTIVITY);
	const stopButton = page.locator(STOP_RECORDING_BUTTON);
	await expect(stopButton).toBeVisible({ timeout: timeoutMs });
};

export const expectStartRecordingButtonVisible = async (page: Page, timeoutMs = 10_000): Promise<void> => {
	await expectVisible(page, RECORDING_ACTIVITY);
	const stopButton = page.locator(START_RECORDING_BUTTON);
	await expect(stopButton).toBeVisible({ timeout: timeoutMs });
};

export const expectRecordingBadgeVisible = async (page: Page, timeoutMs = 30_000): Promise<void> => {
	const recordingTag = page.locator(RECORDING_TAG);
	await expect(recordingTag).toBeVisible({ timeout: timeoutMs });
	await expect(recordingTag).toContainText('REC', { timeout: timeoutMs });

	await expect
		.poll(
			async () => {
				const text = await recordingTag.innerText();
				return text.replace(/\s+/g, ' ').trim();
			},
			{ timeout: timeoutMs }
		)
		.toMatch(/REC\s*\|\s*\d{1,2}:\d{2}:\d{2}/);
};

export const stopRecordingIfActive = async (page: Page): Promise<void> => {
	await ensureRecordingActivityExpanded(page);

	const stopButton = page.locator(STOP_RECORDING_BUTTON);

	if (
		(await stopButton.count()) > 0 &&
		(await stopButton
			.first()
			.isVisible()
			.catch(() => false))
	) {
		await stopButton.first().click();
		await expect.poll(async () => await getRecordingStatusText(page), { timeout: 45_000 }).toBe('STOPPED');
	}
};

export const expectViewRecordingsButtonVisible = async (page: Page, timeoutMs = 10_000): Promise<void> => {
	const viewButton = page.locator(VIEW_RECORDINGS_BUTTON);
	await expect(viewButton).toBeVisible({ timeout: timeoutMs });
};

export const clickViewRecordingsButton = async (page: Page): Promise<Page> => {
	await expectViewRecordingsButtonVisible(page);
	const viewButton = page.locator(VIEW_RECORDINGS_BUTTON);
	const [newPage] = await Promise.all([page.context().waitForEvent('page'), viewButton.click()]);
	return newPage;
};

export const stopRecordingAndOpenActivitiesPanel = async (page: Page): Promise<void> => {
	await stopRecordingIfActive(page);
	await expectActivitiesPanelOpenedWithRecording(page);
};

export const expectViewRecordingsPageOpened = async (page: Page, roomId: string, timeoutMs = 5_000): Promise<void> => {
	await expect.poll(() => page.url(), { timeout: timeoutMs }).toContain(`/meet/room/${roomId}/recordings`);
};

export const expectActivitiesPanelOpenedWithRecording = async (page: Page, timeoutMs = 10_000): Promise<void> => {
	await expect(page.locator(ACTIVITIES_CONTAINER)).toBeVisible({ timeout: timeoutMs });
	await expect(page.locator(RECORDING_ACTIVITY)).toBeVisible({ timeout: timeoutMs });
	await expect(page.locator(RECORDING_STATUS)).toBeVisible({ timeout: timeoutMs });
};
