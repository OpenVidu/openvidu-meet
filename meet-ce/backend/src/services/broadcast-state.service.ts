import { inject, injectable } from 'inversify';
import type { BroadcastRecord } from '../models/broadcast.model.js';
import { RedisKeyName } from '../models/redis.model.js';
import { RedisService } from './redis.service.js';

/**
 * Keeps the broadcasts running in each room, shared across replicas through Redis: the requests
 * that start and stop them and the egress webhooks that move them along may each land on a
 * different backend instance. They live in one hash with a field per room, so every read is one
 * call on one key, and the rooms that have broadcasts are its field names, never a scan of the
 * keyspace.
 */
@injectable()
export class BroadcastStateService {
	constructor(@inject(RedisService) protected redisService: RedisService) {}

	/**
	 * Saves the broadcasts of the room; none left forgets the room. They never expire: a meeting
	 * without a duration limit streams for as long as it lasts, and its end, seen by `room_finished`
	 * or by the broadcasts reconciliation, forgets them.
	 */
	async save(roomId: string, records: BroadcastRecord[]): Promise<void> {
		if (records.length === 0) {
			await this.redisService.removeHashField(RedisKeyName.BROADCASTS, roomId);
			return;
		}

		await this.redisService.setHashField(RedisKeyName.BROADCASTS, roomId, JSON.stringify(records));
	}

	async find(roomId: string): Promise<BroadcastRecord[]> {
		const value = await this.redisService.getHashField(RedisKeyName.BROADCASTS, roomId);
		return value ? (JSON.parse(value) as BroadcastRecord[]) : [];
	}

	/** Whether the room has broadcasts in progress, since a room without any has no field. */
	hasBroadcasts(roomId: string): Promise<boolean> {
		return this.redisService.hasHashField(RedisKeyName.BROADCASTS, roomId);
	}

	/** The rooms with broadcasts in progress. */
	findRoomIds(): Promise<string[]> {
		return this.redisService.getHashFieldNames(RedisKeyName.BROADCASTS);
	}
}
