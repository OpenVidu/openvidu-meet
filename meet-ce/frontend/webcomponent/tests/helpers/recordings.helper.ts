import { MeetWebhookEventType } from '@openvidu-meet/typings';
import { expect, Page } from '@playwright/test';
import { wcLocator } from './webcomponent.helper';
import { openMoreOptionsMenu } from './panels.helper';

// ─── Recording lifecycle ────────────────────────────────────────────────────

/**
 * Starts a recording via the more-options menu and waits for the
 * `.webhook-recordingUpdated` DOM marker set by the testapp. The first egress of a run starts its
 * browser cold, which can take well over 10 s.
 */
export const startRecording = async (page: Page): Promise<void> => {
	await openMoreOptionsMenu(page);
	await wcLocator(page, '#recording-btn').click();
	await expect(page.locator(`.webhook-${MeetWebhookEventType.RECORDING_UPDATED}`)).toBeVisible({ timeout: 40_000 });
};

/**
 * Stops an active recording and waits for the `.webhook-recordingEnded` DOM marker.
 */
export const stopRecording = async (page: Page): Promise<void> => {
	await wcLocator(page, '#stop-recording-btn').click();
	await expect(page.locator(`.webhook-${MeetWebhookEventType.RECORDING_ENDED}`)).toBeVisible({ timeout: 30_000 });
};
