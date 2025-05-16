import {
	AuthenticationPreferencesDTO,
	AuthMode,
	AuthType,
	RoomCreationPolicy,
	SingleUserAuthDTO,
	UpdateSecurityPreferencesDTO,
	ValidAuthMethodDTO,
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

const AuthModeSchema: z.ZodType<AuthMode> = z.enum([AuthMode.NONE, AuthMode.MODERATORS_ONLY, AuthMode.ALL_USERS]);

const AuthTypeSchema: z.ZodType<AuthType> = z.enum([AuthType.SINGLE_USER]);

const SingleUserAuthDTOSchema: z.ZodType<SingleUserAuthDTO> = z.object({
	type: AuthTypeSchema
});

const ValidAuthMethodDTOSchema: z.ZodType<ValidAuthMethodDTO> = SingleUserAuthDTOSchema;

const AuthenticationPreferencesDTOSchema: z.ZodType<AuthenticationPreferencesDTO> = z.object({
	authMode: AuthModeSchema,
	method: ValidAuthMethodDTOSchema
});

const RoomCreationPolicySchema: z.ZodType<RoomCreationPolicy> = z
	.object({
		allowRoomCreation: z.boolean(),
		requireAuthentication: z.boolean().optional()
	})
	.refine(
		(data) => {
			// If allowRoomCreation is true, requireAuthentication must be provided
			return !data.allowRoomCreation || data.requireAuthentication !== undefined;
		},
		{
			message: 'requireAuthentication is required when allowRoomCreation is true',
			path: ['requireAuthentication']
		}
	);

const UpdateSecurityPreferencesDTOSchema: z.ZodType<UpdateSecurityPreferencesDTO> = z
	.object({
		authentication: AuthenticationPreferencesDTOSchema.optional(),
		roomCreationPolicy: RoomCreationPolicySchema.optional()
	})
	.refine((data) => Object.keys(data).length > 0, {
		message: 'At least one field must be provided for the update'
	});

export const validateWebhookPreferences = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = WebhookPreferencesSchema.safeParse(req.body);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.body = data;
	next();
};

export const validateSecurityPreferences = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = UpdateSecurityPreferencesDTOSchema.safeParse(req.body);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.body = data;
	next();
};
