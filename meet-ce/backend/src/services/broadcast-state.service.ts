import { inject, injectable } from 'inversify';
import ms from 'ms';
import { INTERNAL_CONFIG } from '../config/internal-config.js';
import type { BroadcastRecord } from '../models/broadcast.model.js';
import { RedisKeyName } from '../models/redis.model.js';
import { RedisService } from './redis.service.js';

/**
 * Keeps the broadcast running in each room, shared across replicas through Redis: the request that
 * starts it, the egress webhooks that move it along and the requests that change its destinations
 * may each land on a different backend instance. One room holds at most one broadcast.
 */
@injectable()
export class BroadcastStateService {
	private readonly TTL_MS = ms(INTERNAL_CONFIG.BROADCAST_STATE_TTL);

	constructor(@inject(RedisService) protected redisService: RedisService) {}

	async save(record: BroadcastRecord): Promise<void> {
		await this.redisService.set(this.getKey(record.roomId), JSON.stringify(record), this.TTL_MS);
	}

	async find(roomId: string): Promise<BroadcastRecord | null> {
		const value = await this.redisService.get(this.getKey(roomId));
		return value ? (JSON.parse(value) as BroadcastRecord) : null;
	}

	async delete(roomId: string): Promise<void> {
		await this.redisService.delete(this.getKey(roomId));
	}

	private getKey(roomId: string): string {
		return `${RedisKeyName.BROADCAST}${roomId}`;
	}
}
