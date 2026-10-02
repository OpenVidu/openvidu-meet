import { inject, injectable } from 'inversify';
import ms from 'ms';
import { INTERNAL_CONFIG } from '../config/internal-config.js';
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
	private readonly TTL_MS = ms(INTERNAL_CONFIG.BROADCAST_STATE_TTL);

	constructor(@inject(RedisService) protected redisService: RedisService) {}

	/** Saves the broadcasts of the room; none left forgets the room. */
	async save(roomId: string, records: BroadcastRecord[]): Promise<void> {
		if (records.length === 0) {
			await this.redisService.delete(this.getKey(roomId));
			return;
		}

		await this.redisService.set(this.getKey(roomId), JSON.stringify(records), this.TTL_MS);
	}

	async find(roomId: string): Promise<BroadcastRecord[]> {
		const value = await this.redisService.get(this.getKey(roomId));
		return value ? (JSON.parse(value) as BroadcastRecord[]) : [];
	}

	private getKey(roomId: string): string {
		return `${RedisKeyName.BROADCAST}${roomId}`;
	}
}
