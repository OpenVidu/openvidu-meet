import { EventEmitter } from 'events';
import { inject, injectable } from 'inversify';
import { Redis, RedisOptions, SentinelAddress } from 'ioredis';
import ms from 'ms';
import { Redlock } from "@sesamecare-oss/redlock";
import {
	checkModuleEnabled,
	REDIS_DB,
	REDIS_HOST,
	REDIS_PASSWORD,
	REDIS_PORT,
	REDIS_SENTINEL_HOST_LIST,
	REDIS_SENTINEL_MASTER_NAME,
	REDIS_SENTINEL_PASSWORD,
	REDIS_USERNAME
} from '../environment.js';
import { internalError, DistributedEventPayload } from '../models/index.js';
import { LoggerService } from './index.js';

@injectable()
export class RedisService extends EventEmitter {
	protected readonly DEFAULT_TTL: number = ms('32 days');
	protected EVENT_CHANNEL = 'ov_meet_channel';
	protected redisPublisher: Redis;
	protected redisSubscriber: Redis;
	protected isConnected = false;
	protected eventHandler?: (event: DistributedEventPayload) => void;

	constructor(@inject(LoggerService) protected logger: LoggerService) {
		super();

		const redisOptions = this.loadRedisConfig();
		this.redisPublisher = new Redis(redisOptions);
		this.redisSubscriber = new Redis(redisOptions);

		this.setupEventHandlers();
	}

	protected setupEventHandlers(): void {
		const onConnect = () => {
			if (!this.isConnected) {
				this.logger.verbose('Connected to Redis');
			} else {
				this.logger.verbose('Reconnected to Redis');
			}

			this.isConnected = true;
			this.emit('redisConnected');
		};

		const onError = (error: Error) => {
			this.logger.error('Redis Error', error);
			this.emit('redisError', error);
		};

		const onDisconnect = () => {
			this.isConnected = false;
			this.logger.warn('Redis disconnected');
			this.emit('redisDisconnected');
		};

		this.redisPublisher.on('connect', onConnect);
		this.redisSubscriber.on('connect', () => this.logger.verbose('Connected to Redis subscriber'));
		this.redisPublisher.on('error', onError);
		this.redisSubscriber.on('error', (error) => this.logger.error('Redis Subscriber Error', error));
		this.redisPublisher.on('end', onDisconnect);
		this.redisSubscriber.on('end', () => this.logger.warn('Redis subscriber disconnected'));
	}

	createRedlock(retryCount = -1, retryDelay = 200) {
		return new Redlock([this.redisPublisher], {
			driftFactor: 0.01,
			retryCount,
			retryDelay,
			retryJitter: 200 // Random variation in the time between retries.
		});
	}

	public onReady(callback: () => void) {
		if (this.isConnected) {
			callback();
		}

		this.on('redisConnected', callback);
	}

	public onceError(callback: () => void) {
		this.once('redisError', callback);
	}

	/**
	 * Publishes a message to a specified Redis channel.
	 *
	 * @param channel - The name of the Redis channel to publish the message to.
	 * @param message - The message to be published to the channel.
	 * @returns A promise that resolves when the message has been successfully published.
	 */
	async publishEvent(channel: string, message: string) {
		try {
			await this.redisPublisher.publish(channel, message);
		} catch (error) {
			this.logger.error('Error publishing message to Redis', error);
		}
	}

	/**
	 * Subscribes to a Redis channel.
	 *
	 * @param channel - The channel to subscribe to.
	 * @param callback - The callback function to execute when a message is received on the channel.
	 */
	subscribe(channel: string, callback: (message: string) => void) {
		this.logger.verbose(`Subscribing to Redis channel: ${channel}`);
		this.redisSubscriber.subscribe(channel, (err, count) => {
			if (err) {
				this.logger.error('Error subscribing to Redis channel', err);
				return;
			}

			this.logger.verbose(`Subscribed to ${channel}. Now subscribed to ${count} channel(s).`);
		});

		this.redisSubscriber.on('message', (receivedChannel, message) => {
			if (receivedChannel === channel) {
				callback(message);
			}
		});
	}

	/**
	 * Unsubscribes from a Redis channel.
	 *
	 * @param channel - The channel to unsubscribe from.
	 */
	unsubscribe(channel: string) {
		this.redisSubscriber.unsubscribe(channel, (err, count) => {
			if (err) {
				this.logger.error('Error unsubscribing from Redis channel', err);
				return;
			}

			this.logger.verbose(`Unsubscribed from channel ${channel}. Now subscribed to ${count} channel(s).`);
		});
	}

	/**
	 * Retrieves all keys from Redis that match the specified pattern.
	 *
	 * @param pattern - The pattern to match against Redis keys.
	 * @returns A promise that resolves to an array of matching keys.
	 * @throws {internalRecordingError} If there is an error retrieving keys from Redis.
	 */
	async getKeys(pattern: string): Promise<string[]> {
		let cursor = '0';
		const keys: Set<string> = new Set();

		do {
			const [nextCursor, partialKeys] = await this.redisPublisher.scan(cursor, 'MATCH', pattern);
			partialKeys.forEach((key) => keys.add(key));
			cursor = nextCursor;
		} while (cursor !== '0');

		return Array.from(keys);
	}

	/**
	 * Checks if a given key exists in the Redis store.
	 *
	 * @param {string} key - The key to check for existence.
	 * @returns {Promise<boolean>} - A promise that resolves to `true` if the key exists, otherwise `false`.
	 */
	async exists(key: string): Promise<boolean> {
		const result = await this.get(key);
		return !!result;
	}

	get(key: string, hashKey?: string): Promise<string | null> {
		try {
			if (hashKey) {
				return this.redisPublisher.hget(key, hashKey);
			} else {
				return this.redisPublisher.get(key);
			}
		} catch (error) {
			this.logger.error('Error getting value from Redis', error);
			throw internalError('getting value from Redis');
		}
	}

	/**
	 * Sets a value in Redis with an optional TTL (time-to-live).
	 *
	 * @param {string} key - The key under which the value will be stored.
	 * @param {any} value - The value to be stored. Can be a string, number, boolean, or object.
	 * @param {boolean} [withTTL=true] - Whether to set a TTL for the key. Defaults to true.
	 * @returns {Promise<string>} - A promise that resolves to 'OK' if the operation is successful.
	 * @throws {Error} - Throws an error if the value type is invalid or if there is an issue setting the value in Redis.
	 */
	async set(key: string, value: any, withTTL = true): Promise<string> {
		try {
			const valueType = typeof value;

			if (valueType === 'string' || valueType === 'number' || valueType === 'boolean') {
				if (withTTL) {
					await this.redisPublisher.set(key, value, 'EX', this.DEFAULT_TTL);
				} else {
					await this.redisPublisher.set(key, value);
				}
			} else if (valueType === 'object') {
				await this.redisPublisher.hmset(key, value);

				if (withTTL) await this.redisPublisher.expire(key, this.DEFAULT_TTL);
			} else {
				throw new Error('Invalid value type');
			}

			return 'OK';
		} catch (error) {
			this.logger.error('Error setting value in Redis', error);
			throw error;
		}
	}

	/**
	 * Deletes one or more keys from Redis.
	 *
	 * @param keys - A single key string or an array of key strings to delete from Redis
	 * @returns A Promise that resolves to the number of keys that were successfully deleted
	 * @throws {Error} Throws an internal error if the deletion operation fails
	 */
	delete(keys: string | string[]): Promise<number> {
		try {
			if (typeof keys === 'string') {
				keys = [keys];
			}

			return this.redisPublisher.del(keys);
		} catch (error) {
			throw internalError(`deleting key from Redis`);
		}
	}

	cleanup() {
		this.logger.verbose('Cleaning up Redis connections');
		this.redisPublisher.quit();
		this.redisSubscriber.quit();
		this.removeAllListeners();

		if (this.eventHandler) {
			this.off('systemEvent', this.eventHandler);
			this.eventHandler = undefined;
		}

		this.isConnected = false;
		this.logger.verbose('Redis connections cleaned up');
	}

	async checkHealth() {
		return (await this.redisPublisher.ping()) === 'PONG';
	}

	private loadRedisConfig(): RedisOptions {
		// Check if openviduCall module is enabled. If not, exit the process
		checkModuleEnabled();

		//Check if Redis Sentinel is configured
		if (REDIS_SENTINEL_HOST_LIST) {
			const sentinels: Array<SentinelAddress> = [];
			const sentinelHosts = REDIS_SENTINEL_HOST_LIST.split(',');
			sentinelHosts.forEach((host) => {
				const rawHost = host.split(':');

				if (rawHost.length !== 2) {
					throw new Error('The Redis Sentinel host list is required');
				}

				const hostName = rawHost[0];
				const port = parseInt(rawHost[1]);
				sentinels.push({ host: hostName, port });
			});

			if (!REDIS_SENTINEL_PASSWORD) throw new Error('The Redis Sentinel password is required');

			this.logger.verbose('Using Redis Sentinel');
			return {
				sentinels,
				sentinelPassword: REDIS_SENTINEL_PASSWORD,
				username: REDIS_USERNAME,
				password: REDIS_PASSWORD,
				name: REDIS_SENTINEL_MASTER_NAME,
				db: Number(REDIS_DB),
				maxRetriesPerRequest: null, // Infinite retries
			};
		} else {
			this.logger.verbose('Using Redis standalone');
			return {
				port: Number(REDIS_PORT),
				host: REDIS_HOST,
				username: REDIS_USERNAME,
				password: REDIS_PASSWORD,
				db: Number(REDIS_DB),
				maxRetriesPerRequest: null, // Infinite retries
			};
		}
	}
}
