export interface AuthenticationConfig {
    authMethod: ValidAuthMethod;
    authTransportMode: AuthTransportMode;
    authModeToAccessRoom: AuthMode;
}

/**
 * Authentication transport modes for JWT tokens.
 */
export enum AuthTransportMode {
    COOKIE = 'cookie', // JWT sent via cookies
    HEADER = 'header' // JWT sent via Authorization header
}

/**
 * Authentication modes available to enter a room.
 */
export enum AuthMode {
	NONE = 'none', // No authentication required
	MODERATORS_ONLY = 'moderators_only', // Only moderators need authentication
	ALL_USERS = 'all_users', // All users need authentication
}

/**
 * Authentication method base interface.
 */
export interface AuthMethod {
    type: AuthType;
}

/**
 * Enum for authentication types.
 */
export enum AuthType {
	SINGLE_USER = 'single_user',
	// MULTI_USER = 'multi_user',
	// OAUTH_ONLY = 'oauth_only'
}

/**
 * Authentication method: Single user with fixed credentials.
 */
export interface SingleUserAuth extends AuthMethod {
    type: AuthType.SINGLE_USER;
}

/**
 * Authentication method: Multiple users with optional OAuth integration.
 */
// export interface MultiUserAuth extends AuthMethod {
//     type: AuthType.MULTI_USER;
//     oauthProviders?: OAuthProviderConfig[];
// }

/**
 * Authentication method: Only OAuth authentication.
 */
// export interface OAuthOnlyAuth extends AuthMethod {
//     type: AuthType.OAUTH_ONLY;
//     oauthProviders: OAuthProviderConfig[];
// }

/**
 * Union type for allowed authentication methods.
 */
export type ValidAuthMethod = SingleUserAuth /* | MultiUserAuth | OAuthOnlyAuth */;

/**
 * Configuration for OAuth authentication.
 */
// export interface OAuthProviderConfig {
//     provider: OAuthProvider;
//     clientId: string;
//     clientSecret: string;
//     redirectUri: string;
// }

/**
 * Supported OAuth providers.
 */
// export enum OAuthProvider {
//     GOOGLE = 'google',
//     GITHUB = 'github'
// }
