import { describe, expect, it } from '@jest/globals';
import { MeetingPresenceService } from '../../../src/services/meeting-presence.service.js';
import type { RedisService } from '../../../src/services/redis.service.js';

const noopLogger = { info: () => {}, warn: () => {}, debug: () => {}, error: () => {}, verbose: () => {} };

class FakeRedis {
	readonly entries = new Map<string, string>();

	async set(key: string, value: string): Promise<void> {
		this.entries.set(key, value);
	}

	async getKeys(pattern: string): Promise<string[]> {
		const prefix = pattern.replace(/\*$/, '');
		return [...this.entries.keys()].filter((key) => key.startsWith(prefix));
	}

	async getMany(keys: string[]): Promise<(string | null)[]> {
		return keys.map((key) => this.entries.get(key) ?? null);
	}

	async delete(keys: string[]): Promise<void> {
		keys.forEach((key) => this.entries.delete(key));
	}
}

const build = () => {
	const redis = new FakeRedis();
	const service = new MeetingPresenceService(
		...([redis as unknown as RedisService, noopLogger] as unknown as ConstructorParameters<
			typeof MeetingPresenceService
		>)
	);
	return { redis, service };
};

describe('MeetingPresenceService', () => {
	it('tells which meetings a user is in, and as which participant', async () => {
		const { service } = build();
		await service.upsertUserInRoom('alice', 'room-1', 'alice-p1');
		await service.upsertUserInRoom('alice', 'room-2', 'alice-p2');
		await service.upsertUserInRoom('alice2', 'room-3', 'alice2-p3');

		expect(await service.getUserMeetings('alice')).toEqual([
			{ roomId: 'room-1', participantIdentity: 'alice-p1' },
			{ roomId: 'room-2', participantIdentity: 'alice-p2' }
		]);
		expect(await service.getUserMeetings('bob')).toEqual([]);
	});

	it('forgets a user who left one meeting', async () => {
		const { service } = build();
		await service.upsertUserInRoom('alice', 'room-1', 'alice-p1');
		await service.upsertUserInRoom('alice', 'room-2', 'alice-p2');

		await service.removeUserFromRoom('alice', 'room-1');

		expect(await service.getUserMeetings('alice')).toEqual([{ roomId: 'room-2', participantIdentity: 'alice-p2' }]);
	});

	it('forgets every user of a meeting that ended, both ways', async () => {
		const { redis, service } = build();
		await service.upsertUserInRoom('alice', 'room-1', 'alice-p1');
		await service.upsertUserInRoom('bob', 'room-1', 'bob-p1');
		await service.upsertUserInRoom('bob', 'room-2', 'bob-p2');

		await service.removeRoomFromAllUsers('room-1');
		await service.removeRoomFromAllUsers('room-9');

		expect(await service.getUserMeetings('alice')).toEqual([]);
		expect(await service.getUserMeetings('bob')).toEqual([{ roomId: 'room-2', participantIdentity: 'bob-p2' }]);
		expect([...redis.entries.keys()].filter((key) => key.includes('room-1'))).toEqual([]);
	});

	it('forgets every meeting of a deleted user, both ways', async () => {
		const { redis, service } = build();
		await service.upsertUserInRoom('alice', 'room-1', 'alice-p1');
		await service.upsertUserInRoom('alice', 'room-2', 'alice-p2');
		await service.upsertUserInRoom('bob', 'room-1', 'bob-p1');

		await service.removeUserFromAllRooms('alice');
		await service.removeUserFromAllRooms('nobody');

		expect([...redis.entries.keys()].filter((key) => key.includes('alice'))).toEqual([]);
		expect(await service.getUserMeetings('bob')).toEqual([{ roomId: 'room-1', participantIdentity: 'bob-p1' }]);
	});

	it('skips a presence entry whose participant is gone', async () => {
		const { redis, service } = build();
		await service.upsertUserInRoom('alice', 'room-1', 'alice-p1');
		redis.entries.set([...redis.entries.keys()].find((key) => key.includes('alice:room-1'))!, '');

		expect(await service.getUserMeetings('alice')).toEqual([]);
	});
});
