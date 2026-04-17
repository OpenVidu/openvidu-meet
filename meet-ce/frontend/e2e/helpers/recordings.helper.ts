import { expect, type Page } from '@playwright/test';
import { toggleActivitiesPanel } from './meeting-ui.helper';

const ACTIVITIES_CONTAINER = '#activities-container';
const RECORDING_ACTIVITY = '#recording-activity';
const RECORDING_STATUS = '#recording-status';
const START_RECORDING_BUTTON = '#start-recording-btn';
const STOP_RECORDING_BUTTON = '#stop-recording-btn';
const MORE_OPTIONS_BUTTON = '#more-options-btn';
const SETTINGS_RECORDING_BUTTON = '#recording-btn';
const RECORDING_TAG = '#recording-tag';

async function isVisible(page: Page, selector: string): Promise<boolean> {
	const locator = page.locator(selector);
	return (await locator.count()) > 0 && (await locator.first().isVisible().catch(() => false));
}

export async function ensureActivitiesPanelOpen(page: Page): Promise<void> {
	if (!(await isVisible(page, ACTIVITIES_CONTAINER))) {
		await toggleActivitiesPanel(page);
	}

	await expect(page.locator(ACTIVITIES_CONTAINER)).toBeVisible();
	await expect(page.locator(RECORDING_ACTIVITY)).toBeVisible();
}

export async function openMoreOptionsMenu(page: Page): Promise<void> {
	await page.locator(MORE_OPTIONS_BUTTON).click();
	await expect(page.locator(`${SETTINGS_RECORDING_BUTTON}:visible, #toolbar-settings-btn:visible`).first()).toBeVisible();
}

export async function ensureRecordingActivityExpanded(page: Page): Promise<void> {
	await ensureActivitiesPanelOpen(page);

	const startButton = page.locator(START_RECORDING_BUTTON);
	const stopButton = page.locator(STOP_RECORDING_BUTTON);
	const hasAnyControlVisible =
		(await startButton.first().isVisible().catch(() => false)) ||
		(await stopButton.first().isVisible().catch(() => false));

	if (!hasAnyControlVisible) {
		await page.locator(`${RECORDING_ACTIVITY} mat-expansion-panel-header`).click();
	}
}

export async function startRecordingFromActivitiesPanel(page: Page): Promise<void> {
	await ensureRecordingActivityExpanded(page);

	const startButton = page.locator(START_RECORDING_BUTTON);
	await expect(startButton).toBeVisible();
	await expect(startButton).toBeEnabled();
	await startButton.click();
}

export async function startRecordingFromSettingsMenu(page: Page): Promise<void> {
	await openMoreOptionsMenu(page);

	const recordingButton = page.locator(`${SETTINGS_RECORDING_BUTTON}:visible`).first();
	await expect(recordingButton).toBeVisible();
	await expect(recordingButton).toBeEnabled();
	await recordingButton.click();
}

export async function getRecordingStatusText(page: Page): Promise<string> {
	const status = await page.locator(RECORDING_STATUS).first().innerText();
	return status.trim().toUpperCase();
}

export async function expectRecordingStatus(page: Page, expectedStatus: 'STARTING' | 'STARTED', timeoutMs = 20_000): Promise<void> {
	await expect
		.poll(async () => await getRecordingStatusText(page), { timeout: timeoutMs })
		.toBe(expectedStatus);
}

export async function waitForRecordingStarted(page: Page, timeoutMs = 90_000): Promise<void> {
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
}

export async function expectActivitiesPanelOpenedWithRecordingStarting(page: Page, timeoutMs = 20_000): Promise<void> {
	await expect(page.locator(ACTIVITIES_CONTAINER)).toBeVisible({ timeout: timeoutMs });
	await expect(page.locator(RECORDING_ACTIVITY)).toBeVisible({ timeout: timeoutMs });
	await expectRecordingStatus(page, 'STARTING', timeoutMs);
}

export async function expectRecordingTagTimerBadge(page: Page, timeoutMs = 30_000): Promise<void> {
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
}

export async function stopRecordingIfActive(page: Page): Promise<void> {
	await ensureRecordingActivityExpanded(page);

	const stopButton = page.locator(STOP_RECORDING_BUTTON);

	if ((await stopButton.count()) > 0 && (await stopButton.first().isVisible().catch(() => false))) {
		await stopButton.first().click();
		await expect
			.poll(async () => await getRecordingStatusText(page), { timeout: 45_000 })
			.toBe('STOPPED');
	}
}
