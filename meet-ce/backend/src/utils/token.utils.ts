import { AuthTransportMode } from '@openvidu-meet/typings';
import { Request } from 'express';
import { container } from '../config/index.js';
import { INTERNAL_CONFIG } from '../config/internal-config.js';
import { GlobalConfigService, LoggerService } from '../services/index.js';

/**
 * Gets the current authentication transport mode from global config.
 *
 * @returns The current transport mode
 */
export const getAuthTransportMode = async (): Promise<AuthTransportMode> => {
	try {
		const configService = container.get(GlobalConfigService);
		const globalConfig = await configService.getGlobalConfig();
		return globalConfig.securityConfig.authentication.authTransportMode;
	} catch (error) {
		const logger = container.get(LoggerService);
		logger.error('Error fetching auth transport mode:', error);
		// Fallback to header mode in case of error
		return AuthTransportMode.HEADER;
	}
};

/**
 * Extracts the access token from the request based on the configured transport mode.
 *
 * @param req - Express request object
 * @returns The JWT token string or undefined if not found
 */
export const getAccessToken = async (req: Request): Promise<string | undefined> => {
	return getTokenFromRequest(
		req,
		INTERNAL_CONFIG.ACCESS_TOKEN_HEADER,
		INTERNAL_CONFIG.ACCESS_TOKEN_COOKIE_NAME,
		'accessToken'
	);
};

/**
 * Extracts the refresh token from the request based on the configured transport mode.
 *
 * @param req - Express request object
 * @returns The JWT refresh token string or undefined if not found
 */
export const getRefreshToken = async (req: Request): Promise<string | undefined> => {
	return getTokenFromRequest(req, INTERNAL_CONFIG.REFRESH_TOKEN_HEADER, INTERNAL_CONFIG.REFRESH_TOKEN_COOKIE_NAME);
};

/**
 * Extracts the participant token from the request based on the configured transport mode.
 *
 * @param req - Express request object
 * @returns The JWT participant token string or undefined if not found
 */
export const getParticipantToken = async (req: Request): Promise<string | undefined> => {
	return getTokenFromRequest(
		req,
		INTERNAL_CONFIG.PARTICIPANT_TOKEN_HEADER,
		INTERNAL_CONFIG.PARTICIPANT_TOKEN_COOKIE_NAME
	);
};

/**
 * Extracts the recording token from the request based on the configured transport mode.
 *
 * @param req - Express request object
 * @returns The JWT recording token string or undefined if not found
 */
export const getRecordingToken = async (req: Request): Promise<string | undefined> => {
	return getTokenFromRequest(
		req,
		INTERNAL_CONFIG.RECORDING_TOKEN_HEADER,
		INTERNAL_CONFIG.RECORDING_TOKEN_COOKIE_NAME,
		'recordingToken'
	);
};

/**
 * Generic function to extract a JWT token from the request based on the configured transport mode.
 *
 * @param req - Express request object
 * @param headerName - Name of the header to check
 * @param cookieName - Name of the cookie to check
 * @param queryParamName - (Optional) Name of the query parameter to check (for access and recording tokens)
 * @returns The JWT token string or undefined if not found
 */
const getTokenFromRequest = async (
	req: Request,
	headerName: string,
	cookieName: string,
	queryParamName?: string
): Promise<string | undefined> => {
	const transportMode = await getAuthTransportMode();

	if (transportMode === AuthTransportMode.COOKIE) {
		// Try to get from cookie
		return req.cookies[cookieName];
	}

	// Try to get from header
	const headerValue = req.headers[headerName];

	// Header value must be a string starting with 'Bearer '
	if (headerValue && typeof headerValue === 'string' && headerValue.startsWith('Bearer ')) {
		return headerValue.substring(7);
	}

	/**
	 * If not found in header, try to get from query parameter
	 * This is needed to send access/recording tokens via URL for video playback
	 * since we cannot set custom headers in video element requests
	 */
	if (queryParamName) {
		const token = req.query[queryParamName];

		if (token && typeof token === 'string') {
			return token;
		}
	}
};
