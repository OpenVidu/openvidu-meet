import { RedisLockName, RedisLockPrefix } from '../models/redis.model.js';

export class MeetLock {
	private constructor() {
		// Prevent instantiation of this utility class
	}

	static getRecordingActiveLock(roomId: string): string {
		if (!roomId) {
			throw new Error('roomId must be a non-empty string');
		}

		return `${RedisLockPrefix.BASE}${RedisLockName.RECORDING_ACTIVE}_${roomId}`;
	}

	static getRegistryLock(lockName: string): string {
		if (!lockName) {
			throw new Error('lockName must be a non-empty string');
		}

		return `${RedisLockPrefix.REGISTRY}${lockName}`;
	}

	static getScheduledTaskLock(taskName: string): string {
		if (!taskName) {
			throw new Error('taskName must be a non-empty string');
		}

		return `${RedisLockPrefix.BASE}${RedisLockName.SCHEDULED_TASK}_${taskName}`;
	}

	static getRoomGarbageCollectorLock(): string {
		return `${RedisLockPrefix.BASE}${RedisLockName.ROOM_GARBAGE_COLLECTOR}`;
	}
}
