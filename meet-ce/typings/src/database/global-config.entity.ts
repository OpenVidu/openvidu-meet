import { MeetAppearanceConfig } from './room-config.js';

/**
 * Represents global config for OpenVidu Meet.
 *
 * Webhooks are not configured here: they are a resource of their own ({@link MeetWebhook},
 * `/webhooks` on the public API).
 */
export interface GlobalConfig {
	/** The projectId is used to identify the project in which the OpenVidu Meet instance is running. */
	projectId: string;
	/** Security configuration. See {@link SecurityConfig} for details. */
	securityConfig: SecurityConfig;
	/** Rooms configuration. See {@link MeetAppearanceConfig} for details. */
	roomsConfig: {
		appearance: MeetAppearanceConfig;
	};
}

/**
 * Represents the security configuration for OpenVidu Meet, including authentication settings.
 */
export interface SecurityConfig {
	/** Authentication configuration. See {@link AuthenticationConfig} for details */
	authentication: AuthenticationConfig;
}

/**
 * Authentication configuration.
 */
export interface AuthenticationConfig {
	/** List of allowed OAuth providers for user registration */
	oauthProviders: OAuthProviderConfig[];
}

/**
 * Configuration for OAuth authentication.
 */
export interface OAuthProviderConfig {
	/** OAuth provider. See {@link OAuthProvider} for details */
	provider: OAuthProvider;
	/** Client ID obtained from the OAuth provider. */
	clientId: string;
	/** Client secret obtained from the OAuth provider. */
	clientSecret: string;
	/** Redirect URI registered with the OAuth provider. */
	redirectUri: string;
}

/**
 * Supported OAuth providers.
 */
export enum OAuthProvider {
	GOOGLE = 'google',
	GITHUB = 'github'
}
