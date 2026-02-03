import { StringValue } from 'ms';
import { SchemaVersion } from '../models/migration.model.js';

export const INTERNAL_CONFIG = {
	// Base paths for the API
	API_BASE_PATH_V1: '/api/v1',
	INTERNAL_API_BASE_PATH_V1: '/internal-api/v1',

	// Headers names
	API_KEY_HEADER: 'x-api-key',
	ACCESS_TOKEN_HEADER: 'authorization',
	REFRESH_TOKEN_HEADER: 'x-refresh-token',
	ROOM_MEMBER_TOKEN_HEADER: 'x-room-member-token',

	// Token expiration times
	ACCESS_TOKEN_EXPIRATION: '2h',
	REFRESH_TOKEN_EXPIRATION: '1d',
	ROOM_MEMBER_TOKEN_EXPIRATION: '2h',
	PASSWORD_CHANGE_TOKEN_EXPIRATION: '15m',

	// S3 configuration
	S3_MAX_RETRIES_ATTEMPTS_ON_SAVE_ERROR: '5',
	S3_INITIAL_RETRY_DELAY_MS: '100',

	// Cron job configuration
	CRON_JOB_LOCK_TTL: '59s' as StringValue, // Default TTL for cron job locks to avoid overlapping executions

	// Timing and cleanup settings for room lifecycle management
	ROOM_EXPIRED_GC_INTERVAL: '1h' as StringValue, // Interval for processing and deleting expired rooms
	ROOM_ACTIVE_VERIFICATION_GC_INTERVAL: '15m' as StringValue, // Interval for checking room 'active_meeting' status consistency

	// Timing and cleanup settings for recording lifecycle management
	RECORDING_STARTED_TIMEOUT: '20s' as StringValue, // Timeout for recording to be marked as started
	RECORDING_ACTIVE_LOCK_TTL: '7d' as StringValue, // Redis Lock TTL for active recording in a room
	RECORDING_ACTIVE_LOCK_GC_INTERVAL: '15m' as StringValue, // Interval for cleaning up stale active recording locks
	RECORDING_ORPHANED_ACTIVE_LOCK_GRACE_PERIOD: '30s' as StringValue, // Grace period to consider an active recording lock as orphaned (should be greater than RECORDING_STARTED_TIMEOUT)
	RECORDING_STALE_GC_INTERVAL: '14m' as StringValue, // Interval for cleaning up stale recordings (not updated recently)
	RECORDING_STALE_GRACE_PERIOD: '5m' as StringValue, // Maximum allowed time since the last recording update before marking it as stale

	// Additional intervals
	MIN_ROOM_AUTO_DELETE_DURATION: '1h' as StringValue, // Minimum duration before a room can be auto-deleted
	MEETING_EMPTY_TIMEOUT: (process.env.MEETING_EMPTY_TIMEOUT || '20s') as StringValue, // Seconds to keep the meeting (LK room) open until the first participant joins
	MEETING_DEPARTURE_TIMEOUT: (process.env.MEETING_DEPARTURE_TIMEOUT || '20s') as StringValue, // Seconds to keep the meeting (LK room) open after the last participant leaves

	// Participant name reservation
	PARTICIPANT_MAX_CONCURRENT_NAME_REQUESTS: '20', // Maximum number of request by the same name at the same time allowed
	PARTICIPANT_NAME_RESERVATION_TTL: '12h' as StringValue, // Time-to-live for participant name reservations

	CAPTIONS_AGENT_NAME: 'agent-speech-processing',

	// MongoDB Schema Versions
	// These define the current schema version for each collection
	// Increment when making breaking changes to the schema structure
	GLOBAL_CONFIG_SCHEMA_VERSION: 2 as SchemaVersion,
	USER_SCHEMA_VERSION: 2 as SchemaVersion,
	API_KEY_SCHEMA_VERSION: 1 as SchemaVersion,
	ROOM_SCHEMA_VERSION: 2 as SchemaVersion,
	ROOM_MEMBER_SCHEMA_VERSION: 1 as SchemaVersion,
	RECORDING_SCHEMA_VERSION: 1 as SchemaVersion
};

// This function is used to set private configuration values for testing purposes.
// It allows you to override the default values defined in the INTERNAL_CONFIG object.
// This is useful for testing different scenarios without modifying the actual configuration file.
export const setInternalConfig = (overrides: Partial<typeof INTERNAL_CONFIG>): void => {
	Object.assign(INTERNAL_CONFIG, overrides);
};
