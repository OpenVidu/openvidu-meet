import { StringValue } from 'ms';

export const INTERNAL_CONFIG = {
	// Base paths for the API
	API_BASE_PATH_V1: '/api/v1',
	INTERNAL_API_BASE_PATH_V1: '/internal-api/v1',

	// Cookie names
	ACCESS_TOKEN_COOKIE_NAME: 'OvMeetAccessToken',
	REFRESH_TOKEN_COOKIE_NAME: 'OvMeetRefreshToken',
	PARTICIPANT_TOKEN_COOKIE_NAME: 'OvMeetParticipantToken',
	RECORDING_TOKEN_COOKIE_NAME: 'OvMeetRecordingToken',

	// Headers names
	API_KEY_HEADER: 'x-api-key',
	ACCESS_TOKEN_HEADER: 'authorization',
	REFRESH_TOKEN_HEADER: 'x-refresh-token',
	PARTICIPANT_TOKEN_HEADER: 'x-participant-token',
	PARTICIPANT_ROLE_HEADER: 'x-participant-role',
	RECORDING_TOKEN_HEADER: 'x-recording-token',

	// Token expiration times
	ACCESS_TOKEN_EXPIRATION: '2h',
	REFRESH_TOKEN_EXPIRATION: '1d',
	PARTICIPANT_TOKEN_EXPIRATION: '2h',
	RECORDING_TOKEN_EXPIRATION: '2h',

	// Participant name reservations
	PARTICIPANT_MAX_CONCURRENT_NAME_REQUESTS: '20', // Maximum number of request by the same name at the same time allowed
	PARTICIPANT_NAME_RESERVATION_TTL: '12h' as StringValue, // Time-to-live for participant name reservations

	// Authentication usernames
	ANONYMOUS_USER: 'anonymous',
	API_USER: 'api-user',

	// S3 configuration
	S3_MAX_RETRIES_ATTEMPTS_ON_SAVE_ERROR: '5',
	S3_INITIAL_RETRY_DELAY_MS: '100',
	S3_ROOMS_PREFIX: 'rooms',
	S3_RECORDINGS_PREFIX: 'recordings',
	S3_USERS_PREFIX: 'users',
	S3_API_KEYS_PREFIX: 'api_keys',

	// Garbage collection and recording intervals
	ROOM_GC_INTERVAL: '1h' as StringValue, // e.g. garbage collector interval for rooms
	RECORDING_LOCK_TTL: '6h' as StringValue, // TTL for recording lock in Redis
	RECORDING_STARTED_TIMEOUT: '20s' as StringValue, // Timeout for recording start
	RECORDING_LOCK_GC_INTERVAL: '30m' as StringValue, // Garbage collection interval for recording locks
	RECORDING_ORPHANED_LOCK_GRACE_PERIOD: '1m' as StringValue, // Grace period for orphaned recording locks
	RECORDING_STALE_CLEANUP_INTERVAL: '15m' as StringValue, // Cleanup interval for stale recordings
	RECORDING_STALE_AFTER: '5m' as StringValue, // Maximum allowed time since the last recording update before marking as stale

	CRON_JOB_MIN_LOCK_TTL: '59s' as StringValue, // Minimum TTL for cron job locks
	// Additional intervals
	MIN_FUTURE_TIME_FOR_ROOM_AUTODELETION_DATE: '1h' as StringValue, // Minimum time for room auto-deletion date
	MEETING_EMPTY_TIMEOUT: '20s' as StringValue, // Seconds to keep the meeting (LK room) open until the first participant joins
	MEETING_DEPARTURE_TIMEOUT: '20s' as StringValue // Seconds to keep the meeting (LK room) open after the last participant leaves
};

// This function is used to set private configuration values for testing purposes.
// It allows you to override the default values defined in the INTERNAL_CONFIG object.
// This is useful for testing different scenarios without modifying the actual configuration file.
export const setInternalConfig = (overrides: Partial<typeof INTERNAL_CONFIG>): void => {
	Object.assign(INTERNAL_CONFIG, overrides);
};
