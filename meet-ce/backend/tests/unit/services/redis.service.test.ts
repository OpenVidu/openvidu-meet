import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { EventEmitter } from 'events';
import type { RedisOptions } from 'ioredis';
import { MEET_ENV } from '../../../src/environment.js';
import { RedisService } from '../../../src/services/redis.service.js';

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), verbose: () => {}, debug: () => {} };

/** A RedisService that never opens a connection: its client is a plain event emitter. */
const unconnected = () => {
	const service = Object.create(RedisService.prototype) as RedisService;
	EventEmitter.call(service);
	const client = new EventEmitter();
	Object.assign(service, { logger, isConnected: false, client: client });
	return { service, client };
};

const configOf = () =>
	(unconnected().service as unknown as { loadRedisConfig: () => RedisOptions }).loadRedisConfig();

describe('RedisService configuration', () => {
	const original = { ...MEET_ENV };

	afterEach(() => {
		Object.assign(MEET_ENV, original);
	});

	it('connects to a standalone Redis by default', () => {
		Object.assign(MEET_ENV, {
			REDIS_SENTINEL_HOST_LIST: '',
			REDIS_HOST: 'redis.local',
			REDIS_PORT: '6380',
			REDIS_USERNAME: 'meet',
			REDIS_PASSWORD: 'secret',
			REDIS_DB: '3'
		});

		expect(configOf()).toEqual({
			host: 'redis.local',
			port: 6380,
			username: 'meet',
			password: 'secret',
			db: 3,
			maxRetriesPerRequest: null
		});
	});

	it('connects through Redis Sentinel when a sentinel host list is configured', () => {
		Object.assign(MEET_ENV, {
			REDIS_SENTINEL_HOST_LIST: 'sentinel-1:26379,sentinel-2:26380',
			REDIS_SENTINEL_PASSWORD: 'sentinel-secret',
			REDIS_SENTINEL_MASTER_NAME: 'openvidu',
			REDIS_USERNAME: 'meet',
			REDIS_PASSWORD: 'secret',
			REDIS_DB: '2'
		});

		expect(configOf()).toEqual({
			sentinels: [
				{ host: 'sentinel-1', port: 26379 },
				{ host: 'sentinel-2', port: 26380 }
			],
			sentinelPassword: 'sentinel-secret',
			name: 'openvidu',
			username: 'meet',
			password: 'secret',
			db: 2,
			maxRetriesPerRequest: null
		});
	});

	it('refuses a sentinel host without a port, and sentinels without a password', () => {
		Object.assign(MEET_ENV, { REDIS_SENTINEL_HOST_LIST: 'sentinel-1', REDIS_SENTINEL_PASSWORD: 'secret' });
		expect(configOf).toThrow('The Redis Sentinel host list is required');

		Object.assign(MEET_ENV, { REDIS_SENTINEL_HOST_LIST: 'sentinel-1:26379', REDIS_SENTINEL_PASSWORD: '' });
		expect(configOf).toThrow('The Redis Sentinel password is required');
	});
});

describe('RedisService connection events', () => {
	afterEach(() => {
		jest.restoreAllMocks();
	});

	const connected = () => {
		const { service, client } = unconnected();
		(service as unknown as { setupEventHandlers: () => void }).setupEventHandlers();
		return { service, client };
	};

	it('stops the server when Redis cannot be reached at startup', () => {
		const exit = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
		const { client } = connected();

		client.emit('error', new Error('ECONNREFUSED'));

		expect(exit).toHaveBeenCalledWith(1);
	});

	it('keeps the server running through a Redis error once connected, and tells listeners about reconnections', () => {
		const exit = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
		const { service, client } = connected();
		const ready = jest.fn();
		const disconnected = jest.fn();
		service.onDisconnected(disconnected);

		client.emit('connect');
		service.onReady(ready);
		client.emit('error', new Error('connection reset'));
		client.emit('end');
		client.emit('connect');

		expect(exit).not.toHaveBeenCalled();
		expect(disconnected).toHaveBeenCalledTimes(1);
		expect(ready).toHaveBeenCalledTimes(2);
	});
});
