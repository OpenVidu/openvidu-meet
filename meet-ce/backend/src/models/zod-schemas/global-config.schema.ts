import {
	AuthenticationConfig,
	AuthMode,
	AuthType,
	SecurityConfig,
	SingleUserAuth,
	ValidAuthMethod,
	WebhookConfig
} from '@openvidu-meet/typings';
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

export const WebhookTestSchema = z.object({
	url: z
		.string()
		.url('Must be a valid URL')
		.regex(/^https?:\/\//, { message: 'URL must start with http:// or https://' })
});

const AuthModeSchema: z.ZodType<AuthMode> = z.nativeEnum(AuthMode);

const AuthTypeSchema: z.ZodType<AuthType> = z.nativeEnum(AuthType);

const SingleUserAuthSchema: z.ZodType<SingleUserAuth> = z.object({
	type: AuthTypeSchema
});

const ValidAuthMethodSchema: z.ZodType<ValidAuthMethod> = SingleUserAuthSchema;

const AuthenticationConfigSchema: z.ZodType<AuthenticationConfig> = z.object({
	authMethod: ValidAuthMethodSchema,
	authModeToAccessRoom: AuthModeSchema
});

export const SecurityConfigSchema: z.ZodType<SecurityConfig> = z.object({
	authentication: AuthenticationConfigSchema
});

export const RoomsAppearanceConfigSchema = z.object({
	appearance: AppearanceConfigSchema
});
