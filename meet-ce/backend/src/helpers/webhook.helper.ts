import type { MeetWebhook, MeetWebhookPayload } from '@openvidu-meet/typings';
import { MeetWebhookEventType } from '@openvidu-meet/typings';

/**
 * Extracts the room a webhook payload belongs to, used to match room-scoped webhooks.
 *
 * Every current payload ({@link MeetWebhookPayload}) carries its `roomId`; the fallback exists so a
 * future room-less payload degrades to "not deliverable to room-scoped webhooks" instead of failing.
 */
export function extractWebhookRoomId(payload: MeetWebhookPayload): string | undefined {
	return 'roomId' in payload ? payload.roomId : undefined;
}

/**
 * Decides whether a registered webhook receives an event.
 *
 * A webhook matches when it is enabled, its `events` filter is absent or contains the event type,
 * and its `roomId` scope is absent or equals the room the event belongs to. An event that carries
 * no room never matches a room-scoped webhook.
 */
export function webhookMatchesEvent(webhook: MeetWebhook, event: MeetWebhookEventType, roomId?: string): boolean {
	if (!webhook.enabled) {
		return false;
	}

	if (webhook.events && !webhook.events.includes(event)) {
		return false;
	}

	if (webhook.roomId && webhook.roomId !== roomId) {
		return false;
	}

	return true;
}
