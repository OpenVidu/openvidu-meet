import { expect, type Page } from '@playwright/test';
import { openMoreOptionsMenu, toggleActivitiesPanel } from './panels.helper';
import { expectVisible } from './ui-utils.helper';

const ACTIVITIES_CONTAINER = '#activities-container';
const BROADCAST_ACTIVITY = '#broadcast-activity';
const BROADCAST_STATUS = '#broadcast-status';
const GO_LIVE_BUTTON = '#go-live-btn';
const STOP_BROADCAST_BUTTON = '#stop-broadcast-btn';
const BROADCAST_TAG = '#broadcast-tag';
const NOTIFICATION = '.ov-notification';

/** The phases the activity reports through `data-status`. */
export type BroadcastPhase = 'idle' | 'starting' | 'live' | 'ending' | 'failed';

/** How the activity reports each destination row through `data-status`. */
export type DestinationRowStatus = 'connecting' | 'live' | 'stopping' | 'stopped' | 'failed';

const ensureActivitiesPanelOpen = async (page: Page): Promise<void> => {
	if (!(await page.locator(ACTIVITIES_CONTAINER).isVisible())) {
		await toggleActivitiesPanel(page);
	}
};

/**
 * Opens the activities panel and expands the broadcast activity, whose body holds the destinations
 * and the controls.
 */
export const expandBroadcastActivity = async (page: Page): Promise<void> => {
	await ensureActivitiesPanelOpen(page);
	await expectVisible(page, BROADCAST_ACTIVITY);

	if (!(await page.locator(`${BROADCAST_ACTIVITY} .activity-body`).isVisible())) {
		await page.locator(`${BROADCAST_ACTIVITY} mat-expansion-panel-header`).click();
	}
};

/** Goes live from the activity, to every destination it proposes. */
export const goLiveFromActivitiesPanel = async (page: Page): Promise<void> => {
	await expandBroadcastActivity(page);

	const button = page.locator(GO_LIVE_BUTTON);
	await expect(button).toBeEnabled();
	await button.click();
};

/** Leaves a room destination out of the broadcasts the activity is about to start. */
export const untickPlannedDestination = async (page: Page, destinationId: string): Promise<void> => {
	await expandBroadcastActivity(page);
	await page.locator(`#broadcast-destination-${destinationId} input[type="checkbox"]`).uncheck();
};

/** Adds a destination for the meeting from the activity's editor: streamed to at once while live, or planned. */
export const addDestinationFromActivitiesPanel = async (page: Page, name: string, url: string): Promise<void> => {
	await expandBroadcastActivity(page);
	await page.locator('#broadcast-add-destination-btn').click();
	await page.locator('#broadcast-destination-name').fill(name);
	await page.locator('#broadcast-destination-url').fill(url);
	await page.locator('#broadcast-destination-save-btn').click();
};

/** Goes live, or stops every broadcast, from the toolbar's more-options menu. */
export const toggleBroadcastFromToolbar = async (page: Page): Promise<void> => {
	await openMoreOptionsMenu(page);

	const button = page.locator('#broadcast-btn');
	await expect(button).toBeEnabled();
	await button.click();
};

/** Stops every broadcast from the activity. */
export const stopBroadcastFromActivitiesPanel = async (page: Page): Promise<void> => {
	await expandBroadcastActivity(page);

	const button = page.locator(STOP_BROADCAST_BUTTON);
	await expect(button).toBeEnabled();
	await button.click();
};

/**
 * Asserts the phase the activity reports, read off `data-status` rather than its copy, which is in
 * the active language.
 */
export const expectBroadcastPhase = async (page: Page, phase: BroadcastPhase, timeoutMs = 15_000): Promise<void> => {
	await expect(page.locator(BROADCAST_STATUS)).toHaveAttribute('data-status', phase, { timeout: timeoutMs });
};

/** Asserts what the activity reports of one room destination. */
export const expectDestinationStatus = async (
	page: Page,
	destinationId: string,
	status: DestinationRowStatus,
	timeoutMs = 30_000
): Promise<void> => {
	await expect(page.locator(`#broadcast-destination-${destinationId}`)).toHaveAttribute('data-status', status, {
		timeout: timeoutMs
	});
};

/** Asserts that the LIVE chip in the status rail is up and counting. */
export const expectBroadcastBadgeVisible = async (page: Page, timeoutMs = 40_000): Promise<void> => {
	const broadcastTag = page.locator(BROADCAST_TAG);
	await expect(broadcastTag).toContainText('LIVE', { timeout: timeoutMs });
	await expect
		.poll(async () => (await broadcastTag.innerText()).replace(/\s+/g, ' ').trim(), { timeout: timeoutMs })
		.toMatch(/LIVE\s*\d{1,2}:\d{2}:\d{2}/);
};

export const expectNoBroadcastBadge = async (page: Page, timeoutMs = 15_000): Promise<void> => {
	await expect(page.locator(BROADCAST_TAG)).toBeHidden({ timeout: timeoutMs });
};

/** Asserts that the meeting stage is announcing the given broadcast transition, read off `data-kind`. */
export const expectBroadcastNotice = async (
	page: Page,
	announcement: 'started' | 'stopped',
	timeoutMs = 15_000
): Promise<void> => {
	await expect(page.locator(`${NOTIFICATION}[data-kind="broadcast-${announcement}"]`)).toBeVisible({
		timeout: timeoutMs
	});
};

/** Asserts that the activity shows the broadcasts but offers nothing to do about them. */
export const expectNoBroadcastControls = async (page: Page): Promise<void> => {
	await expandBroadcastActivity(page);
	await expect(page.locator(`${BROADCAST_ACTIVITY} .activity-permission`)).toBeVisible();
	await expect(page.locator(GO_LIVE_BUTTON)).toHaveCount(0);
	await expect(page.locator(STOP_BROADCAST_BUTTON)).toHaveCount(0);
};
