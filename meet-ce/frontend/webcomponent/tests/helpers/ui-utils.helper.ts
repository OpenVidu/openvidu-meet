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
 * @param options.matchIndex - When more than one webhook of `eventName` lands for the room (e.g. one
 * `participantJoined` per participant), which occurrence to return, in arrival order. Defaults to
 * the first (`0`), matching prior behavior.
 */
export const getWebhookFromStorage = async (
	page: Page,
	roomId: string,
	eventName: MeetWebhookEventType,
	options: { timeout?: number; matchIndex?: number } = {}
): Promise<MeetWebhookEvent> => {
	const { timeout = 10_000, matchIndex = 0 } = options;

	const handle = await page.waitForFunction(
		({ roomId, eventName, matchIndex }) => {
			const data = sessionStorage.getItem('webhookEventsByRoom');

			if (!data) return null;

			const map = JSON.parse(data) as Record<string, Array<{ event: string }>>;
			const matches = map[roomId]?.filter((e) => e.event === eventName) ?? [];
			return matches[matchIndex] ?? null;
		},
		{ roomId, eventName, matchIndex },
		{ timeout }
	);

	return (await handle.jsonValue()) as MeetWebhookEvent;
};
