export const REDIS_KEY_PREFIX = 'ov_meet:';

export const enum RedisKeyName {
	//Tracks all currently reserved participant names per room (with TTL for auto-expiration).
	ROOM_PARTICIPANTS = `${REDIS_KEY_PREFIX}room_participants:`,
	// Stores released numeric suffixes (per base name) in a sorted set, so that freed numbers
	// can be reused efficiently instead of always incrementing to the next highest number.
	PARTICIPANT_NAME_POOL = `${REDIS_KEY_PREFIX}participant_pool:`
}

export const enum RedisLockPrefix {
	BASE = 'ov_meet_lock:',
	REGISTRY = 'ov_meet_lock_registry:'
}

export const enum RedisLockName {
	RECORDING_ACTIVE = 'recording_active',
	SCHEDULED_TASK = 'scheduled_task',
	STORAGE_INITIALIZATION = 'storage_initialization',
	MIGRATION = 'migration',
	WEBHOOK = 'webhook'
}
