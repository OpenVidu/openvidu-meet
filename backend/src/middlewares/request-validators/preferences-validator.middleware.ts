import {
	AuthenticationPreferences,
	AuthMode,
	AuthType,
	SecurityPreferences,
	SingleUserAuth,
	ValidAuthMethod,
	WebhookPreferences
} from '@typings-ce';
import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { rejectUnprocessableRequest } from '../../models/error.model.js';

const WebhookPreferencesSchema: z.ZodType<WebhookPreferences> = z
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

const AuthModeSchema: z.ZodType<AuthMode> = z.enum([AuthMode.NONE, AuthMode.MODERATORS_ONLY, AuthMode.ALL_USERS]);

const AuthTypeSchema: z.ZodType<AuthType> = z.enum([AuthType.SINGLE_USER]);

const SingleUserAuthSchema: z.ZodType<SingleUserAuth> = z.object({
	type: AuthTypeSchema
});

const ValidAuthMethodSchema: z.ZodType<ValidAuthMethod> = SingleUserAuthSchema;

const AuthenticationPreferencesSchema: z.ZodType<AuthenticationPreferences> = z.object({
	authMethod: ValidAuthMethodSchema,
	authModeToAccessRoom: AuthModeSchema
});

const SecurityPreferencesSchema: z.ZodType<SecurityPreferences> = z.object({
	authentication: AuthenticationPreferencesSchema
});

export const validateWebhookPreferences = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = WebhookPreferencesSchema.safeParse(req.body);

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

export const validateSecurityPreferences = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = SecurityPreferencesSchema.safeParse(req.body);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.body = data;
	next();
};
