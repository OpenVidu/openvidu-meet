/**
 * Authentication configuration.
 */
export interface AuthenticationConfig {
	/**
	 * List of allowed OAuth providers for user registration.
	 */
	oauthProviders: OAuthProviderConfig[];
}

/**
 * Configuration for OAuth authentication.
 */
export interface OAuthProviderConfig {
	provider: OAuthProvider;
	clientId: string;
	clientSecret: string;
	redirectUri: string;
}

/**
 * Supported OAuth providers.
 */
export enum OAuthProvider {
	GOOGLE = 'google',
	GITHUB = 'github'
}
