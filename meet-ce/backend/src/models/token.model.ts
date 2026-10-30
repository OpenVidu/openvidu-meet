import type { LiveKitPermissions, MeetRoomMemberTokenMetadata } from '@openvidu-meet/typings';

/**
 * Metadata associated with access, refresh, and temporary tokens.
 */
export interface TokenMetadata {
	/** Token issued at timestamp (milliseconds since epoch) */
	iat: number;
	/** Type of the token */
	tokenType: TokenType;
	/** Login session the token belongs to, shared by every token obtained from one login or password change */
	sid?: string;
	/** Identifier of a refresh token, so that it can be exchanged only once */
	rid?: string;
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

/**
 * Options for generating room member tokens.
 */
export interface MeetRoomMemberTokenOptions {
	/** Metadata for the room member token */
	tokenMetadata: MeetRoomMemberTokenMetadata;
	/** Permissions for LiveKit */
	livekitPermissions?: LiveKitPermissions;
	/** Name of the participant */
	participantName?: string;
	/** Identity of the participant */
	participantIdentity?: string;
}
