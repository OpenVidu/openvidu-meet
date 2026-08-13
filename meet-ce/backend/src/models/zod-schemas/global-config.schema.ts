import type { AuthenticationConfig, SecurityConfig } from '@openvidu-meet/typings';
import { OAuthProvider } from '@openvidu-meet/typings';
import { z } from 'zod';
import { AppearanceConfigSchema } from './room.schema.js';

const OAuthProviderConfigSchema = z.object({
	provider: z.enum(OAuthProvider),
	clientId: z.string(),
	clientSecret: z.string(),
	redirectUri: z.string()
});

const AuthenticationConfigSchema: z.ZodType<AuthenticationConfig> = z.object({
	oauthProviders: z.array(OAuthProviderConfigSchema)
});

export const SecurityConfigSchema: z.ZodType<SecurityConfig> = z.object({
	authentication: AuthenticationConfigSchema
});

export const RoomsAppearanceConfigSchema = z.object({
	appearance: AppearanceConfigSchema
});
