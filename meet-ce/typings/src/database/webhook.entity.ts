import { MeetWebhookEventType } from '../webhook.js';

/**
 * A registered webhook endpoint: a URL that OpenVidu Meet POSTs event notifications to,
 * optionally filtered by event type and scoped to a single room.
 *
 * Every registered (and enabled) webhook receives each matching event independently, with the
 * same envelope, signature and retry policy.
 */
export interface MeetWebhook {
	/** Unique identifier of the webhook */
	webhookId: string;
	/** The URL event notifications are POSTed to */
	url: string;
	/**
	 * Event types delivered to this webhook.
	 * When omitted, every event type is delivered.
	 */
	events?: MeetWebhookEventType[];
	/**
	 * Room the webhook is scoped to: only events of that room are delivered.
	 * When omitted, events of every room are delivered.
	 */
	roomId?: string;
	/** Whether the webhook currently receives events */
	enabled: boolean;
	/** Timestamp in milliseconds since epoch when the webhook was created */
	creationDate: number;
}
