import {
	AuthenticationConfig,
	AuthMode,
	AuthTransportMode,
	AuthType,
	SecurityConfig,
	SingleUserAuth,
	ValidAuthMethod,
	WebhookConfig
} from '@typings-ce';
import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { rejectUnprocessableRequest } from '../../models/error.model.js';
import { AppearanceConfigSchema } from './room-validator.middleware.js';

const WebhookConfigSchema: z.ZodType<WebhookConfig> = z
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

const WebhookTestSchema = z.object({
	url: z
		.string()
		.url('Must be a valid URL')
		.regex(/^https?:\/\//, { message: 'URL must start with http:// or https://' })
});

const AuthTransportModeSchema = z.enum([AuthTransportMode.COOKIE, AuthTransportMode.HEADER]);

const AuthModeSchema: z.ZodType<AuthMode> = z.enum([AuthMode.NONE, AuthMode.MODERATORS_ONLY, AuthMode.ALL_USERS]);

const AuthTypeSchema: z.ZodType<AuthType> = z.enum([AuthType.SINGLE_USER]);

const SingleUserAuthSchema: z.ZodType<SingleUserAuth> = z.object({
	type: AuthTypeSchema
});

const ValidAuthMethodSchema: z.ZodType<ValidAuthMethod> = SingleUserAuthSchema;

const AuthenticationConfigSchema: z.ZodType<AuthenticationConfig> = z.object({
	authMethod: ValidAuthMethodSchema,
	authTransportMode: AuthTransportModeSchema,
	authModeToAccessRoom: AuthModeSchema
});

const SecurityConfigSchema: z.ZodType<SecurityConfig> = z.object({
	authentication: AuthenticationConfigSchema
});

const RoomsAppearanceConfigSchema = z.object({
	appearance: AppearanceConfigSchema
});

export const validateWebhookConfig = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = WebhookConfigSchema.safeParse(req.body);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.body = data;
	next();
};

export const withValidWebhookTestRequest = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = WebhookTestSchema.safeParse(req.body);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.body = data;
	next();
};

export const validateSecurityConfig = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = SecurityConfigSchema.safeParse(req.body);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.body = data;
	next();
};

export const validateRoomsAppearanceConfig = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = RoomsAppearanceConfigSchema.safeParse(req.body);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.body = data;
	next();
};
