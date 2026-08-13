import type { MeetWebhookOptions } from '@openvidu-meet/typings';
import { MeetWebhookEventType } from '@openvidu-meet/typings';
import { z } from 'zod';

/**
 * Validates the body of webhook create/update requests ({@link MeetWebhookOptions}).
 *
 * `events` must be omitted (every event type) or non-empty: an explicit empty array would be a
 * webhook that never fires, which is what `enabled: false` expresses.
 */
export const MeetWebhookOptionsSchema: z.ZodType<MeetWebhookOptions> = z.object({
	url: z.url('Must be a valid URL').regex(/^https?:\/\//, { message: 'URL must start with http:// or https://' }),
	events: z
		.array(z.enum(MeetWebhookEventType))
		.nonempty('Must contain at least one event type (omit the field to receive every event)')
		.optional(),
	roomId: z.string().trim().min(1, 'Room ID cannot be empty').optional(),
	enabled: z.boolean().optional()
});
