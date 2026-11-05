import { inject, injectable } from 'inversify';
import ms from 'ms';
import { INTERNAL_CONFIG } from '../config/internal-config.js';
import { RedisKeyName } from '../models/redis.model.js';
import { runConcurrently } from '../utils/concurrency.utils.js';
import { LoggerService } from './logger.service.js';
import { RedisService } from './redis.service.js';

const RESERVE_NAME_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if current then
	local ok, reservation = pcall(cjson.decode, current)
	if not (ok and type(reservation) == 'table' and reservation.identity == ARGV[1]) then
		return 0
	end
end
redis.call('SET', KEYS[1], ARGV[2], 'PX', ARGV[3])
return 1
`;

const RELEASE_NAME_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if not current then
	return 0
end
local ok, reservation = pcall(cjson.decode, current)
if ok and type(reservation) == 'table' and (reservation.identity ~= ARGV[1] or reservation.reservedAt > tonumber(ARGV[2])) then
	return 0
end
redis.call('DEL', KEYS[1])
return 1
`;

@injectable()
export class ParticipantNameService {
	private readonly MAX_CONCURRENT_NAME_REQUESTS = INTERNAL_CONFIG.PARTICIPANT_MAX_CONCURRENT_NAME_REQUESTS;
	private readonly PARTICIPANT_NAME_TTL = ms(INTERNAL_CONFIG.PARTICIPANT_NAME_RESERVATION_TTL);

	constructor(
		@inject(RedisService) protected redisService: RedisService,
		@inject(LoggerService) protected logger: LoggerService
	) {}

	/**
	 * Reserves a unique participant name for a room using atomic operations.
	 * If the requested name is taken by another identity, it generates alternatives with incremental
	 * suffixes. A name held by the same identity, an earlier session of the same member or user, is
	 * taken over.
	 *
	 * @param roomId - The room identifier
	 * @param requestedName - The desired participant name
	 * @param participantIdentity - The identity of the participant the name is reserved for
	 * @returns Promise<string> - The reserved unique name
	 * @throws Error if unable to reserve a unique name after max retries
	 */
	async reserveUniqueName(roomId: string, requestedName: string, participantIdentity: string): Promise<string> {
		const participantsKey = `${RedisKeyName.ROOM_PARTICIPANTS}${roomId}`;

		// Extract the base name without any numeric suffix
		// This prevents infinite concatenation of "_1" when user requests "BOB_1" and it's taken
		const { baseName: extractedBaseName, originalCaseBase } = this.extractBaseName(requestedName);
		const normalizedBaseName = extractedBaseName.toLowerCase();

		const reservedOriginal = await this.tryReserveName(participantsKey, requestedName, participantIdentity);

		if (reservedOriginal) {
			this.logger.verbose(`Reserved original name '${requestedName}' for room '${roomId}'`);
			return requestedName;
		}

		// Numbered from the base name, so "BOB_1" taken gives "BOB_2" rather than "BOB_1_1"
		for (let attempt = 1; attempt <= this.MAX_CONCURRENT_NAME_REQUESTS; attempt++) {
			const number = await this.findNextAvailableNumber(roomId, normalizedBaseName);
			const alternativeName = `${normalizedBaseName}_${number}`;

			if (await this.tryReserveName(participantsKey, alternativeName, participantIdentity)) {
				this.logger.verbose(
					`Reserved alternative name '${alternativeName}' for room '${roomId}' (attempt ${attempt})`
				);
				return `${originalCaseBase}_${number}`;
			}
		}

		throw new Error(
			`Unable to reserve unique name for '${requestedName}' in room '${roomId}' after ${this.MAX_CONCURRENT_NAME_REQUESTS} attempts`
		);
	}

	/**
	 * Releases the name a session of a participant reserved, making it and its number suffix available
	 * for others. A reservation taken over after that
	 * session joined belongs to a newer session of the same identity, so it is kept.
	 *
	 * @param roomId - The room identifier
	 * @param participantName - The name to release
	 * @param participantIdentity - The identity of the leaving session
	 * @param joinedAt - When the leaving session joined, in milliseconds since epoch
	 */
	async releaseName(
		roomId: string,
		participantName: string,
		participantIdentity: string,
		joinedAt: number
	): Promise<void> {
		const participantsKey = `${RedisKeyName.ROOM_PARTICIPANTS}${roomId}`;
		// Normalize the name for case-insensitive checks
		const normalizedName = participantName.toLowerCase();

		try {
			const released = await this.redisService.runScript(
				RELEASE_NAME_SCRIPT,
				[`${participantsKey}:${normalizedName}`],
				[participantIdentity, joinedAt]
			);

			if (released !== 1) {
				this.logger.verbose(`Name '${participantName}' for room '${roomId}' is held by a newer session`);
				return;
			}

			this.logger.verbose(`Released name '${participantName}' for room '${roomId}'`);
		} catch (error) {
			this.logger.warn(`Error releasing name '${participantName}' for room '${roomId}':`, error);
		}
	}

	/**
	 * Checks if a participant name is currently reserved in a room.
	 *
	 * @param roomId - The room identifier
	 * @param participantName - The name to check
	 * @returns Promise<boolean> - True if the name is reserved
	 */
	async isNameReserved(roomId: string, participantName: string): Promise<boolean> {
		// Normalize the name for case-insensitive checks
		const normalizedName = participantName.toLowerCase();
		const participantsKey = `${RedisKeyName.ROOM_PARTICIPANTS}${roomId}`;
		return await this.redisService.exists(`${participantsKey}:${normalizedName}`);
	}

	/**
	 * Gets all currently reserved names in a room.
	 *
	 * @param roomId - The room identifier
	 * @returns Promise<string[]> - Array of reserved participant names
	 */
	async getReservedNames(roomId: string): Promise<string[]> {
		const participantsKey = `${RedisKeyName.ROOM_PARTICIPANTS}${roomId}`;
		const pattern = `${participantsKey}:*`;

		try {
			const keys = await this.redisService.getKeys(pattern);
			return keys.map((key) => key.replace(`${participantsKey}:`, ''));
		} catch (error) {
			this.logger.warn(`Error getting reserved names for room '${roomId}'`, error);
			return [];
		}
	}

	/**
	 * Cleans up expired participant name reservations for a room.
	 * This should be called periodically or when a room is cleaned up.
	 *
	 * @param roomId - The room identifier
	 */
	async cleanupExpiredReservations(roomId: string): Promise<void> {
		const participantsKey = `${RedisKeyName.ROOM_PARTICIPANTS}${roomId}`;
		const pattern = `${participantsKey}:*`;
		const concurrency = INTERNAL_CONFIG.CONCURRENCY_BULK_CLEANUP_PARTICIPANT_NAME_RESERVATIONS;

		try {
			const participantKeys = await this.redisService.getKeys(pattern);

			// Redis TTL will automatically clean up expired keys, but we can force cleanup if needed.
			await runConcurrently(
				participantKeys,
				async (key) => {
					await this.redisService.delete(key);
				},
				{ concurrency, failFast: true }
			);

			this.logger.verbose(
				`Cleaned up ${participantKeys.length} expired participant name reservations for room '${roomId}'`
			);
		} catch (error) {
			this.logger.warn(`Error cleaning up reservations for room '${roomId}'`, error);
		}
	}

	/**
	 * Attempts to atomically reserve a specific name for an identity: free names are taken, and a name
	 * the same identity holds is taken over with a new reservation time.
	 *
	 * @private
	 * @param participantsKey - The Redis key prefix for participants
	 * @param name - The name to reserve
	 * @param participantIdentity - The identity the name is reserved for
	 * @returns Promise<boolean> - True if reservation was successful
	 */
	private async tryReserveName(participantsKey: string, name: string, participantIdentity: string): Promise<boolean> {
		// Normalize the name for case-insensitive checks
		const normalizedName = name.toLowerCase();
		const nameKey = `${participantsKey}:${normalizedName}`;
		const reservation = JSON.stringify({ identity: participantIdentity, reservedAt: Date.now() });

		try {
			const reserved = await this.redisService.runScript(
				RESERVE_NAME_SCRIPT,
				[nameKey],
				[participantIdentity, reservation, this.PARTICIPANT_NAME_TTL]
			);
			return reserved === 1;
		} catch (error) {
			this.logger.warn(`Error trying to reserve name '${name}':`, error);
			return false;
		}
	}

	/**
	 * Finds the next available sequential number by checking existing participants.
	 *
	 * @private
	 * @param roomId - The room identifier
	 * @param baseName - The base name
	 * @returns Promise<number> - The next available number
	 */
	private async findNextAvailableNumber(roomId: string, baseName: string): Promise<number> {
		const participantsKey = `${RedisKeyName.ROOM_PARTICIPANTS}${roomId}`;
		const pattern = `${participantsKey}:${baseName}_*`;

		try {
			const existingKeys = await this.redisService.getKeys(pattern);
			const usedNumbers = new Set<number>();

			const prefix = `${participantsKey}:${baseName}_`;

			for (const key of existingKeys) {
				const suffix = key.slice(prefix.length);

				if (/^\d+$/.test(suffix)) {
					usedNumbers.add(parseInt(suffix, 10));
				}
			}

			// Find the smallest available number starting from 1
			let nextNumber = 1;

			while (usedNumbers.has(nextNumber)) {
				nextNumber++;
			}

			this.logger.verbose(`Generated new sequential number ${nextNumber} for '${baseName}' in room '${roomId}'`);
			return nextNumber;
		} catch (error) {
			this.logger.warn(`Error finding next available number for '${baseName}' in room '${roomId}'`, error);
			// Fallback to timestamp-based number if everything fails
			return Date.now() % 10000;
		}
	}

	/**
	 * Extracts the base name from a participant name that may have a numeric suffix.
	 * This prevents infinite concatenation of suffixes (e.g., "BOB_1_1_1...").
	 *
	 * Examples:
	 * - "BOB" -> { baseName: "BOB", originalCaseBase: "BOB" }
	 * - "BOB_1" -> { baseName: "BOB", originalCaseBase: "BOB" }
	 * - "Alice_42" -> { baseName: "Alice", originalCaseBase: "Alice" }
	 * - "John_Doe_5" -> { baseName: "John_Doe", originalCaseBase: "John_Doe" }
	 *
	 * @private
	 * @param name - The participant name to extract base from
	 * @returns Object with baseName (lowercase) and originalCaseBase (original case)
	 */
	private extractBaseName(name: string): { baseName: string; originalCaseBase: string } {
		// Match pattern: anything ending with underscore followed by one or more digits
		const match = name.match(/^(.+)_(\d+)$/);

		if (match) {
			// Name has a numeric suffix, extract the base name
			const originalCaseBase = match[1];
			return {
				baseName: originalCaseBase.toLowerCase(),
				originalCaseBase: originalCaseBase
			};
		}

		// No numeric suffix, the whole name is the base
		return {
			baseName: name.toLowerCase(),
			originalCaseBase: name
		};
	}
}
