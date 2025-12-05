import { AuthenticationConfig, SecurityConfig, WebhookConfig } from '@openvidu-meet/typings';
import { z } from 'zod';
import { AppearanceConfigSchema } from './room.schema.js';

export const WebhookConfigSchema: z.ZodType<WebhookConfig> = z
	.object({
		enabled: z.boolean(),
		url: z
			.string()
			.url('Must be a valid URL')
			.regex(/^https?:\/\//, { message: 'URL must start with http:// or https://' })
			.optional()
	})
	.refine(
		(data) => {
			// If webhooks are enabled, URL must be provided
			return !data.enabled || Boolean(data.url);
		},
		{
			message: 'URL is required when webhooks are enabled',
			path: ['url']
		}
	);

export const TestWebhookReqSchema = z.object({
	url: z
		.string()
		.url('Must be a valid URL')
		.regex(/^https?:\/\//, { message: 'URL must start with http:// or https://' })
});

const AuthenticationConfigSchema: z.ZodType<AuthenticationConfig> = z.object({
	allowUserCreation: z.boolean()
});

export const SecurityConfigSchema: z.ZodType<SecurityConfig> = z.object({
	authentication: AuthenticationConfigSchema
});

export const RoomsAppearanceConfigSchema = z.object({
	appearance: AppearanceConfigSchema
});
