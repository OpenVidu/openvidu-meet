import { StringValue } from 'ms';

const INTERNAL_CONFIG = {
	// Base paths for the API
	API_BASE_PATH: '/meet/api',
	INTERNAL_API_BASE_PATH_V1: '/meet/internal-api/v1',
	API_BASE_PATH_V1: '/meet/api/v1',

	// Cookie names
	PARTICIPANT_TOKEN_COOKIE_NAME: 'OvMeetParticipantToken',
	ACCESS_TOKEN_COOKIE_NAME: 'OvMeetAccessToken',
	REFRESH_TOKEN_COOKIE_NAME: 'OvMeetRefreshToken',

	// Headers for API requests
	API_KEY_HEADER: 'x-api-key',

	// Fixed usernames
	ANONYMOUS_USER: 'anonymous',
	API_USER: 'api-user',

	// S3 prefixes
	S3_ROOMS_PREFIX: 'rooms',
	S3_RECORDINGS_PREFIX: 'recordings',

	// Garbage collection and recording lock intervals
	ROOM_GC_INTERVAL: '1h' as StringValue, // e.g. garbage collector interval for rooms
	RECORDING_LOCK_TTL: '6h' as StringValue, // TTL for recording lock in Redis
	RECORDING_STARTED_TIMEOUT: '20s' as StringValue, // Timeout for recording start
	RECORDING_LOCK_GC_INTERVAL: '30m' as StringValue, // Garbage collection interval for recording locks

	CRON_JOB_MIN_LOCK_TTL: '59s' as StringValue, // Minimum TTL for cron job locks
	// Additional intervals
	MIN_FUTURE_TIME_FOR_ROOM_AUTODELETION_DATE: '1h' as StringValue
};

// This function is used to set private configuration values for testing purposes.
// It allows you to override the default values defined in the INTERNAL_CONFIG object.
// This is useful for testing different scenarios without modifying the actual configuration file.
export const setInternalConfig = (overrides: Partial<typeof INTERNAL_CONFIG>): void => {
	Object.assign(INTERNAL_CONFIG, overrides);
};

export default INTERNAL_CONFIG;
