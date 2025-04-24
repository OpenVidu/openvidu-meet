export const enum RedisKeyPrefix {
	BASE = 'ov_meet:'
}

export const enum RedisKeyName {
	GLOBAL_PREFERENCES = `${RedisKeyPrefix.BASE}global_preferences`,
	ROOM = `${RedisKeyPrefix.BASE}room:`
}

export const enum RedisLockPrefix {
	BASE = 'ov_meet_lock:',
	REGISTRY = 'ov_meet_lock_registry:'
}

export const enum RedisLockName {
	ROOM_GARBAGE_COLLECTOR = 'room_garbage_collector',
	RECORDING_ACTIVE = 'recording_active',
	SCHEDULED_TASK = 'scheduled_task',
	GLOBAL_PREFERENCES = 'global_preferences'
}
