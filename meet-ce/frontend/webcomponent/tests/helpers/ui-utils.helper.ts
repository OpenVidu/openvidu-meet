import { MeetWebhookEvent, MeetWebhookEventType } from '@openvidu-meet/typings';
import { Page } from '@playwright/test';

// ─── Webhook / session-storage utilities ────────────────────────────────────

/**
 * Retrieves a webhook event stored by the testapp in `sessionStorage`.
 *
 * Polls via `page.waitForFunction` until the event is present (auto-retry) or
 * the timeout elapses.
 *
 * @param page - Playwright page (must be the testapp page).
 * @param roomId - Room ID the event belongs to.
 * @param eventName - Webhook event name (e.g. `'meetingStarted'`).
 */
export const getWebhookFromStorage = async (
	page: Page,
	roomId: string,
	eventName: MeetWebhookEventType,
	options: { timeout?: number } = {}
): Promise<MeetWebhookEvent> => {
	const { timeout = 10_000 } = options;

	const handle = await page.waitForFunction(
		({ roomId, eventName }) => {
			const data = sessionStorage.getItem('webhookEventsByRoom');
			if (!data) return null;

			const map = JSON.parse(data) as Record<string, Array<{ event: string }>>;
			return map[roomId]?.find((e) => e.event === eventName) ?? null;
		},
		{ roomId, eventName },
		{ timeout }
	);

	return (await handle.jsonValue()) as MeetWebhookEvent;
};
