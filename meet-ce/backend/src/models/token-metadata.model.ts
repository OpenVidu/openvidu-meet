/**
 * Metadata associated with access, refresh, and temporary tokens.
 */
export interface TokenMetadata {
	/** Token issued at timestamp (milliseconds since epoch) */
	iat: number;
	/** Type of the token */
	tokenType: TokenType;
}

/**
 * Types of tokens used in the system.
 */
export enum TokenType {
	/** Access token for regular authentication */
	ACCESS = 'access',
	/** Refresh token for obtaining new access tokens */
	REFRESH = 'refresh',
	/** Temporary token for special operations like password change */
	TEMPORARY = 'temporary'
}
