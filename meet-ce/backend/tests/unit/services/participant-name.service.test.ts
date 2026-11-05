import { describe, expect, it } from '@jest/globals';
import type { RedisService } from '../../../src/services/redis.service.js';
import { ParticipantNameService } from '../../../src/services/participant-name.service.js';

const noopLogger = { info: () => {}, warn: () => {}, debug: () => {}, error: () => {}, verbose: () => {} };

/**
 * Redis for the name reservations: the reserve script takes a free name or one its identity already holds, and the
 * release script frees a name its identity holds. Keys are matched by prefix, as the SCAN patterns end in `*`.
 */
class FakeRedis {
	readonly names = new Map<string, string>();
	failing = false;

	async runScript(script: string, [key]: string[], [identity]: string[]): Promise<number> {
		if (this.failing) throw new Error('Redis down');

		const holder = this.names.get(key);

		if (script.includes("redis.call('SET'")) {
			if (holder !== undefined && holder !== identity) return 0;

			this.names.set(key, identity);
			return 1;
		}

		if (holder !== identity) return 0;

		this.names.delete(key);
		return 1;
	}

	async getKeys(pattern: string): Promise<string[]> {
		if (this.failing) throw new Error('Redis down');

		const prefix = pattern.replace(/\*$/, '');
		return [...this.names.keys()].filter((key) => key.startsWith(prefix));
	}
}

const build = () => {
	const redis = new FakeRedis();
	const service = new ParticipantNameService(
		...([redis as unknown as RedisService, noopLogger] as unknown as ConstructorParameters<
			typeof ParticipantNameService
		>)
	);
	return { redis, service };
};

describe('ParticipantNameService', () => {
	it('numbers a taken name from its base, keeping the case it was asked in', async () => {
		const { service } = build();

		expect(await service.reserveUniqueName('room-1', 'Ana', 'p1')).toBe('Ana');
		expect(await service.reserveUniqueName('room-1', 'ANA', 'p2')).toBe('ANA_1');
		expect(await service.reserveUniqueName('room-1', 'Ana_1', 'p3')).toBe('Ana_2');
	});

	it('gives the lowest free number again once its holder leaves', async () => {
		const { service } = build();
		await service.reserveUniqueName('room-1', 'Ana', 'p1');
		await service.reserveUniqueName('room-1', 'Ana', 'p2');
		await service.reserveUniqueName('room-1', 'Ana', 'p3');

		await service.releaseName('room-1', 'Ana_1', 'p2', Date.now());

		expect(await service.reserveUniqueName('room-1', 'Ana', 'p4')).toBe('Ana_1');
		expect(await service.reserveUniqueName('room-1', 'Ana', 'p5')).toBe('Ana_3');
	});

	it('numbers a name only after the names that share its whole base', async () => {
		const { service } = build();
		await service.reserveUniqueName('room-1', 'Ana', 'p1');
		await service.reserveUniqueName('room-1', 'Ana_Bob_1', 'p2');
		await service.reserveUniqueName('room-1', 'Ana_2b', 'p3');

		expect(await service.reserveUniqueName('room-1', 'Ana', 'p4')).toBe('Ana_1');
	});

	it('still reserves a numbered name when the taken names cannot be listed', async () => {
		const { redis, service } = build();
		await service.reserveUniqueName('room-1', 'Ana', 'p1');
		redis.getKeys = async () => Promise.reject(new Error('Redis down'));

		expect(await service.reserveUniqueName('room-1', 'Ana', 'p2')).toMatch(/^Ana_\d{1,4}$/);
	});

	it('keeps a name released by an identity that does not hold it', async () => {
		const { service } = build();
		await service.reserveUniqueName('room-1', 'Ana', 'p1');

		await service.releaseName('room-1', 'Ana', 'p2', Date.now());

		expect(await service.reserveUniqueName('room-1', 'Ana', 'p3')).toBe('Ana_1');
	});

	it('gives up after the requested name and 20 numbered ones cannot be reserved', async () => {
		const { redis, service } = build();
		let attempts = 0;
		redis.runScript = async () => {
			attempts++;
			return 0;
		};

		await expect(service.reserveUniqueName('room-1', 'Ana', 'p1')).rejects.toThrow(
			"Unable to reserve unique name for 'Ana' in room 'room-1' after 20 attempts"
		);
		expect(attempts).toBe(21);
	});

	it('never fails the departure whose name it cannot release', async () => {
		const { redis, service } = build();
		redis.failing = true;

		await expect(service.releaseName('room-1', 'Ana', 'p1', Date.now())).resolves.toBeUndefined();
	});
});
