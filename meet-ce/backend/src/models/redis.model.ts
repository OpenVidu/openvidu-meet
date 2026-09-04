export const REDIS_KEY_PREFIX = 'ov_meet:';

export const enum RedisKeyName {
	//Tracks all currently reserved participant names per room (with TTL for auto-expiration).
	ROOM_PARTICIPANTS = `${REDIS_KEY_PREFIX}room_participants:`,
	// Stores released numeric suffixes (per base name) in a sorted set, so that freed numbers
	// can be reused efficiently instead of always incrementing to the next highest number.
	PARTICIPANT_NAME_POOL = `${REDIS_KEY_PREFIX}participant_pool:`,
	// Stores active meeting presence indexed by user and room.
	USER_ACTIVE_MEETING = `${REDIS_KEY_PREFIX}active_meeting_by_user:`,
	// Stores active meeting presence indexed by room and user.
	ROOM_ACTIVE_MEETING = `${REDIS_KEY_PREFIX}active_meeting_by_room:`,
	// Tracks the set of participants that have an assistant capability active in a room.
	AI_ASSISTANT_PARTICIPANTS = `${REDIS_KEY_PREFIX}ai_assistant:participants:`,
	// Marks that a room's recording was deliberately stopped during the current meeting, so the
	// recording auto-start must not fire again until the meeting ends.
	RECORDING_AUTO_START_DISABLED = `${REDIS_KEY_PREFIX}recording_auto_start_disabled:`,
	// Marks that the current meeting was force-ended for exceeding its room's duration limit rather
	// than by a moderator (the stored value is the meeting's LiveKit room sid), so room_finished can
	// attribute the meetingEnded webhook and the participants' left reason correctly.
	MEETING_ENDED_CAUSE = `${REDIS_KEY_PREFIX}meeting_ended_cause:`
}

export const enum RedisLockPrefix {
	BASE = 'ov_meet_lock:',
	REGISTRY = 'ov_meet_lock_registry:'
}

export const enum RedisLockName {
	RECORDING_ACTIVE = 'recording_active',
	RECORDING_STOP = 'recording_stop',
	SCHEDULED_TASK = 'scheduled_task',
	MEETING_DURATION_LIMIT_END = 'meeting_duration_limit_end',
	STORAGE_INITIALIZATION = 'storage_initialization',
	MIGRATION = 'migration',
	WEBHOOK = 'webhook',
	WEBHOOK_REGISTRATION = 'webhook_registration',
	AI_ASSISTANT = 'ai_assistant'
}
