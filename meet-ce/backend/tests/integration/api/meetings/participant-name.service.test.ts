import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import ms from 'ms';
import { container, registerDependencies } from '../../../../src/config/dependency-injector.config.js';
import { RedisKeyName } from '../../../../src/models/redis.model.js';
import { ParticipantNameService } from '../../../../src/services/participant-name.service.js';
import { RedisService } from '../../../../src/services/redis.service.js';

describe('ParticipantNameService', () => {
	let participantNameService: ParticipantNameService;
	let redisService: RedisService;
	const testRoomId = 'test-room-unique-names';
	const holders = new Map<string, string>();
	let sessions = 0;

	// Each reservation stands for the session of a different participant unless a test names the identity
	const reserve = async (roomId: string, name: string, identity = `participant-${++sessions}`) => {
		const reserved = await participantNameService.reserveUniqueName(roomId, name, identity);
		holders.set(`${roomId}:${reserved}`, identity);
		return reserved;
	};

	const reserveAt = async (reservedAt: number, name: string, identity: string) => {
		const now = jest.spyOn(Date, 'now').mockReturnValue(reservedAt);

		try {
			return await reserve(testRoomId, name, identity);
		} finally {
			now.mockRestore();
		}
	};

	const release = (roomId: string, name: string, joinedAt = Date.now()) =>
		participantNameService.releaseName(roomId, name, holders.get(`${roomId}:${name}`) ?? 'unknown', joinedAt);

	beforeAll(async () => {
		registerDependencies();
		participantNameService = container.get(ParticipantNameService);
		redisService = container.get(RedisService);

		await cleanupTestData();
	});

	afterEach(async () => {
		// Clean up test data after each test
		await cleanupTestData();
	});

	// Every room this suite reserves names in starts with testRoomId, so one prefix per key family clears it all
	async function cleanupTestData() {
		try {
			for (const pattern of [
				`ov_meet:room_participants:${testRoomId}*`,
				`ov_meet:participant_pool:${testRoomId}*`
			]) {
				const keys = await redisService.getKeys(pattern);

				if (keys.length > 0) {
					await redisService.delete(keys);
				}
			}
		} catch (error) {
			// Ignore cleanup errors
		}
	}

	describe('Reserve unique participant name', () => {
		it('should reserve the original name when available', async () => {
			const requestedName = 'Participant';
			const reservedName = await reserve(testRoomId, requestedName);

			expect(reservedName).toBe(requestedName);

			// Verify the name is actually reserved
			const isReserved = await participantNameService.isNameReserved(testRoomId, requestedName);
			expect(isReserved).toBe(true);
		});

		it('should treat names as case-insensitive if required', async () => {
			await reserve(testRoomId, 'Participant');
			const reserved2 = await reserve(testRoomId, 'participant');
			expect(reserved2).toBe('participant_1');
		});

		it('should generate alternative names when original is taken', async () => {
			const requestedName = 'Participant';

			// Reserve the original name
			const firstReservation = await reserve(testRoomId, requestedName);
			expect(firstReservation).toBe(requestedName);

			// Try to reserve the same name again - should get alternative
			const secondReservation = await reserve(testRoomId, requestedName);
			expect(secondReservation).toBe(`${requestedName}_1`);

			// Try again - should get next alternative
			const thirdReservation = await reserve(testRoomId, requestedName);
			expect(thirdReservation).toBe(`${requestedName}_2`);
		});

		it('should not concatenate "_1" infinitely when user requests a name ending with "_number"', async () => {
			// This test detects the bug where requesting "BOB_1" when "BOB_1" is taken
			// results in "BOB_1_1" instead of finding the next available number

			const baseName = 'BOB';

			// Reserve BOB
			const name1 = await reserve(testRoomId, baseName);
			expect(name1).toBe('BOB');

			// Reserve BOB again -> should get BOB_1
			const name2 = await reserve(testRoomId, baseName);
			expect(name2).toBe('BOB_1');

			// Now a user explicitly requests "BOB_1" (which is already taken)
			// Should get BOB_2, NOT BOB_1_1
			const name3 = await reserve(testRoomId, 'BOB_1');
			expect(name3).toBe('BOB_2');

			// Request BOB again -> should get BOB_3
			const name4 = await reserve(testRoomId, baseName);
			expect(name4).toBe('BOB_3');

			// Request BOB_2 (already taken) -> should get BOB_4
			const name5 = await reserve(testRoomId, 'BOB_2');
			expect(name5).toBe('BOB_4');
		});

		it('should handle complex name patterns with underscores correctly', async () => {
			// Test with names that already have underscores in them

			// Reserve "John_Doe"
			const name1 = await reserve(testRoomId, 'John_Doe');
			expect(name1).toBe('John_Doe');

			// Reserve "John_Doe" again -> should get "John_Doe_1"
			const name2 = await reserve(testRoomId, 'John_Doe');
			expect(name2).toBe('John_Doe_1');

			// Request "John_Doe_1" (already taken) -> should get "John_Doe_2"
			const name3 = await reserve(testRoomId, 'John_Doe_1');
			expect(name3).toBe('John_Doe_2');

			// Request "John_Doe_5" (not taken yet) -> should reserve "John_Doe_5"
			const name4 = await reserve(testRoomId, 'John_Doe_5');
			expect(name4).toBe('John_Doe_5');

			// Request "John_Doe" again -> should get "John_Doe_3" (next available)
			const name5 = await reserve(testRoomId, 'John_Doe');
			expect(name5).toBe('John_Doe_3');
		});

		it('should handle concurrent reservations properly', async () => {
			const requestedName = 'Participant';
			const concurrentRequests = 5;

			// Simulate concurrent requests for the same name
			const reservationPromises = Array.from({ length: concurrentRequests }, () =>
				reserve(testRoomId, requestedName)
			);

			const reservedNames = await Promise.all(reservationPromises);

			// All names should be unique
			const uniqueNames = new Set(reservedNames);
			expect(uniqueNames.size).toBe(concurrentRequests);

			// First name should be the original
			expect(reservedNames).toContain(requestedName);

			// Others should be alternatives
			for (let i = 1; i < concurrentRequests; i++) {
				expect(reservedNames).toContain(`${requestedName}_${i}`);
			}
		});

		it('should reuse numbers when participants disconnect', async () => {
			const requestedName = 'Participant';

			// Reserve multiple names
			const name1 = await reserve(testRoomId, requestedName);
			const name2 = await reserve(testRoomId, requestedName);
			const name3 = await reserve(testRoomId, requestedName);

			expect(name1).toBe('Participant');
			expect(name2).toBe('Participant_1');
			expect(name3).toBe('Participant_2');

			// Release the middle one
			await release(testRoomId, name2);

			// Next reservation should reuse the released number
			const name4 = await reserve(testRoomId, requestedName);
			expect(name4).toBe('Participant_1'); // Should reuse the released number
		});

		it('should maintain optimal numbering after multiple releases', async () => {
			const requestedName = 'Optimized';

			// Create several names
			const names: string[] = [];

			for (let i = 0; i < 5; i++) {
				names.push(await reserve(testRoomId, requestedName));
			}

			expect(names).toEqual(['Optimized', 'Optimized_1', 'Optimized_2', 'Optimized_3', 'Optimized_4']);

			// Release some names (simulate participants leaving)
			await release(testRoomId, 'Optimized_1');
			await release(testRoomId, 'Optimized_3');

			// New participants should get the lowest available numbers
			const newName1 = await reserve(testRoomId, requestedName);
			const newName2 = await reserve(testRoomId, requestedName);

			expect(newName1).toBe('Optimized_1'); // Lowest available
			expect(newName2).toBe('Optimized_3'); // Next lowest available
		});
	});

	describe('releaseName', () => {
		it('should release a reserved name', async () => {
			const participantName = 'Participant';

			// Reserve a name
			await reserve(testRoomId, participantName);
			expect(await participantNameService.isNameReserved(testRoomId, participantName)).toBe(true);

			// Release the name
			await release(testRoomId, participantName);
			expect(await participantNameService.isNameReserved(testRoomId, participantName)).toBe(false);
		});

		it('should allow reusing a released name', async () => {
			const participantName = 'Frank';

			// Reserve, release, and reserve again
			await reserve(testRoomId, participantName);
			await release(testRoomId, participantName);

			const newReservation = await reserve(testRoomId, participantName);
			expect(newReservation).toBe(participantName);
		});
	});

	describe('Reservations owned by an identity', () => {
		it('should give an identity its own name back and another identity a suffix', async () => {
			expect(await reserve(testRoomId, 'Ana', 'member-ana')).toBe('Ana');
			expect(await reserve(testRoomId, 'Ana', 'member-ana')).toBe('Ana');
			expect(await reserve(testRoomId, 'Ana', 'member-bob')).toBe('Ana_1');
		});

		it('should keep a name a newer session took over when the earlier session leaves', async () => {
			await reserveAt(1_000, 'Ana', 'member-ana');
			await reserveAt(3_000, 'Ana', 'member-ana');

			await release(testRoomId, 'Ana', 2_000);

			expect(await participantNameService.isNameReserved(testRoomId, 'Ana')).toBe(true);
			expect(await reserve(testRoomId, 'Ana', 'member-bob')).toBe('Ana_1');
		});

		it('should free the name of the leaving session and return its suffix to the pool', async () => {
			await reserve(testRoomId, 'Ana', 'member-ana');
			const suffixedName = await reserveAt(1_000, 'Ana', 'member-bob');

			await release(testRoomId, suffixedName, 2_000);

			expect(await participantNameService.isNameReserved(testRoomId, suffixedName)).toBe(false);
			expect(await reserve(testRoomId, 'Ana', 'member-carol')).toBe('Ana_1');
		});

		it('should release a reservation in the old format and never give it back by identity', async () => {
			const nameKey = `${RedisKeyName.ROOM_PARTICIPANTS}${testRoomId}:ana`;
			await redisService.setIfNotExists(nameKey, Date.now().toString(), ms('1m'));

			expect(await reserve(testRoomId, 'Ana', 'member-ana')).toBe('Ana_1');

			await participantNameService.releaseName(testRoomId, 'Ana', 'member-ana', Date.now());
			expect(await participantNameService.isNameReserved(testRoomId, 'Ana')).toBe(false);
		});
	});

	describe('getReservedNames', () => {
		it('should return all reserved names in a room in lowercase', async () => {
			const names = ['Grace', 'Henry', 'Iris'];

			// Reserve multiple names
			for (const name of names) {
				await reserve(testRoomId, name);
			}

			const reservedNames = await participantNameService.getReservedNames(testRoomId);

			for (const name of names) {
				expect(reservedNames).toContain(name.toLowerCase());
			}
		});

		it('should return empty array when no names are reserved', async () => {
			const reservedNames = await participantNameService.getReservedNames(testRoomId);
			expect(reservedNames).toEqual([]);
		});
	});

	describe('Reserve unique participant name - edge cases', () => {
		it('should be able to reserve same 20 names', async () => {
			const requestedName = 'LimitTest';

			const promises: Promise<string>[] = [];
			const twentyNames = participantNameService['MAX_CONCURRENT_NAME_REQUESTS'];

			for (let i = 0; i <= twentyNames; i++) {
				promises.push(reserve(testRoomId, requestedName));
			}

			// Los primeros MAX_RETRIES deben resolverse bien
			const results = await Promise.allSettled(promises);

			const fulfilled = results.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<string>[];
			const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];

			console.log(fulfilled);
			expect(fulfilled.length).toBe(twentyNames + 1); // +1 for the original name
			expect(rejected.length).toBe(0);
		});

		it('should handle race condition when reusing released numbers', async () => {
			const requestedName = 'RaceTest';

			// Try to reserve two names
			const n1 = await reserve(testRoomId, requestedName);
			const n2 = await reserve(testRoomId, requestedName);

			expect([n1, n2]).toEqual(['RaceTest', 'RaceTest_1']);

			// Release _1
			await release(testRoomId, n2);

			// Try to reserve again concurrently
			const [c1, c2] = await Promise.all([
				reserve(testRoomId, requestedName),
				reserve(testRoomId, requestedName)
			]);

			// One of them should be _1 and the other should be _2
			expect([c1, c2].sort()).toEqual(['RaceTest_1', 'RaceTest_2']);
		});

		it('should reuse expired names after TTL', async () => {
			const service = participantNameService as unknown as { PARTICIPANT_NAME_TTL: number };
			const configuredTtl = service.PARTICIPANT_NAME_TTL;
			service.PARTICIPANT_NAME_TTL = ms('50ms');

			try {
				const requestedName = 'TTLTest';
				const name = await reserve(testRoomId, requestedName);
				expect(name).toBe('TTLTest');

				await new Promise((resolve) => setTimeout(resolve, service.PARTICIPANT_NAME_TTL + 50));

				const newName = await reserve(testRoomId, requestedName);
				expect(newName).toBe('TTLTest');
			} finally {
				service.PARTICIPANT_NAME_TTL = configuredTtl;
			}
		});

		it('should keep names isolated per room', async () => {
			const requestedName = 'Isolated';

			// Reserve in two different rooms
			const room1Name = await reserve(`${testRoomId}-a`, requestedName);
			const room2Name = await reserve(`${testRoomId}-b`, requestedName);

			// Both names should be isolated
			expect(room1Name).toBe(requestedName);
			expect(room2Name).toBe(requestedName);
		});

		it('should treat names case-insensitively if normalization is enabled', async () => {
			const requestedName = 'CaseTest';

			const n1 = await reserve(testRoomId, requestedName);
			expect(n1).toBe('CaseTest');

			// Try to reserve with different casing
			const n2 = await reserve(testRoomId, 'casetest');
			expect(n2).toBe('casetest_1'); // Should return alternative name with original case
		});
	});
});
