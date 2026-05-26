import { MeetWebhookEventType } from '@openvidu-meet/typings';
import { expect, Page } from '@playwright/test';
import { iframeLocator } from './iframe.helper';
import { openMoreOptionsMenu } from './panels.helper';

// ─── Recording lifecycle ────────────────────────────────────────────────────

/**
 * Starts a recording via the more-options menu and waits for the
 * `.webhook-recordingUpdated` DOM marker set by the testapp.
 */
export const startRecording = async (page: Page): Promise<void> => {
	await openMoreOptionsMenu(page);
	await iframeLocator(page, '#recording-btn').click();
	await expect(page.locator(`.webhook-${MeetWebhookEventType.RECORDING_UPDATED}`)).toBeVisible({ timeout: 10_000 });
};

/**
 * Stops an active recording and waits for the `.webhook-recordingEnded` DOM marker.
 */
export const stopRecording = async (page: Page): Promise<void> => {
	await iframeLocator(page, '#stop-recording-btn').click();
	await expect(page.locator(`.webhook-${MeetWebhookEventType.RECORDING_ENDED}`)).toBeVisible({ timeout: 10_000 });
};
