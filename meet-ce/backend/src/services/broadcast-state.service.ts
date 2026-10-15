import { inject, injectable } from 'inversify';
import type { BroadcastRecord } from '../models/broadcast.model.js';
import { RedisKeyName } from '../models/redis.model.js';
import { RedisService } from './redis.service.js';

/**
 * Keeps the broadcasts running in each room, shared across replicas through Redis: the requests
 * that start and stop them and the egress webhooks that move them along may each land on a
 * different backend instance.
 */
@injectable()
export class BroadcastStateService {
	constructor(@inject(RedisService) protected redisService: RedisService) {}

	/**
	 * Saves the broadcasts of the room; none left forgets the room. They never expire: a meeting
	 * without a duration limit streams for as long as it lasts, and its end, seen by `room_finished`
	 * or by the meeting reconciliation, forgets them.
	 */
	async save(roomId: string, records: BroadcastRecord[]): Promise<void> {
		if (records.length === 0) {
			await this.redisService.delete(this.getKey(roomId));
			return;
		}

		await this.redisService.set(this.getKey(roomId), JSON.stringify(records));
	}

	async find(roomId: string): Promise<BroadcastRecord[]> {
		const value = await this.redisService.get(this.getKey(roomId));
		return value ? (JSON.parse(value) as BroadcastRecord[]) : [];
	}

	private getKey(roomId: string): string {
		return `${RedisKeyName.BROADCAST}${roomId}`;
	}
}
