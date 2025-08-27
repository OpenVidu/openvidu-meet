export const enum RedisKeyPrefix {
	BASE = 'ov_meet:'
}

export const enum RedisKeyName {
	GLOBAL_PREFERENCES = `${RedisKeyPrefix.BASE}global_preferences`,
	ROOM = `${RedisKeyPrefix.BASE}room:`,
	RECORDING = `${RedisKeyPrefix.BASE}recording:`,
	RECORDING_SECRETS = `${RedisKeyPrefix.BASE}recording_secrets:`,
	ARCHIVED_ROOM = `${RedisKeyPrefix.BASE}archived_room:`,
	USER = `${RedisKeyPrefix.BASE}user:`,
	API_KEYS = `${RedisKeyPrefix.BASE}api_keys:`,
	//Tracks all currently reserved participant names per room (with TTL for auto-expiration).
	ROOM_PARTICIPANTS = `${RedisKeyPrefix.BASE}room_participants:`,
	// Stores released numeric suffixes (per base name) in a sorted set, so that freed numbers
	// can be reused efficiently instead of always incrementing to the next highest number.
	PARTICIPANT_NAME_POOL = `${RedisKeyPrefix.BASE}participant_pool:`
}

export const enum RedisLockPrefix {
	BASE = 'ov_meet_lock:',
	REGISTRY = 'ov_meet_lock_registry:'
}

export const enum RedisLockName {
	ROOM_GARBAGE_COLLECTOR = 'room_garbage_collector',
	RECORDING_ACTIVE = 'recording_active',
	SCHEDULED_TASK = 'scheduled_task',
	STORAGE_INITIALIZATION = 'storage_initialization',
	WEBHOOK = 'webhook'
}
