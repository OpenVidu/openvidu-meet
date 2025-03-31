export const enum RedisLockPrefix {
	BASE = 'ov_meet_lock:',
	REGISTRY = 'ov_meet_lock_registry:'
}

export const enum RedisLockName {
	ROOM_GARBAGE_COLLECTOR = 'room_garbage_collector',
	RECORDING_ACTIVE = 'recording_active',
	SCHEDULED_TASK = 'scheduled_task'
}
