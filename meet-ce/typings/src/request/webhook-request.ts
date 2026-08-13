import { MeetWebhookEventType } from '../webhook.js';

/**
 * Options for registering a webhook, or the full replacement definition when updating one
 * (an omitted optional field is cleared, not preserved).
 */
export interface MeetWebhookOptions {
	/** The URL event notifications are POSTed to. Must be an `http(s)` URL. */
	url: string;
	/**
	 * Event types delivered to the webhook.
	 * When omitted, every event type is delivered.
	 */
	events?: MeetWebhookEventType[];
	/**
	 * Room to scope the webhook to: only events of that room are delivered.
	 * When omitted, events of every room are delivered.
	 */
	roomId?: string;
	/** Whether the webhook receives events. Defaults to `true`. */
	enabled?: boolean;
}
