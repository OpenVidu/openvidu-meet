/**
 * The LiveKit egress webhooks that move an egress along, as the feature owning the egress (a
 * recording or a broadcast) receives them.
 */
export type EgressWebhookAction = 'started' | 'updated' | 'ended';

/**
 * What LiveKit reports about an egress that failed, in the shape both a recording and a broadcast
 * carry it. Every field is absent while nothing failed.
 */
export interface EgressError {
	errorCode?: number;
	error?: string;
	details?: string;
}
