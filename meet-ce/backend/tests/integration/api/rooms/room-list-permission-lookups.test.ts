import { afterAll, afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { container } from '../../../../src/config/dependency-injector.config.js';
import { RoomRepository } from '../../../../src/repositories/room.repository.js';
import {
	createRoom,
	deleteAllRooms,
	getRooms,
	loginRootAdmin,
	startTestServer
} from '../../../helpers/request-helpers.js';

describe('Room API Tests', () => {
	const ROOMS = 8;
	let roomRepository: RoomRepository;

	beforeAll(async () => {
		await startTestServer();
		roomRepository = container.get(RoomRepository);

		for (let i = 0; i < ROOMS; i++) {
			await createRoom({ roomName: `lookup-${i}` });
		}
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	afterAll(async () => {
		await deleteAllRooms();
	});

	describe('Listing rooms as an administrator', () => {
		it('does not fetch every listed room again to decide what an API key may see', async () => {
			const lookups = jest.spyOn(roomRepository, 'findByRoomId');

			const response = await getRooms({ maxItems: ROOMS });

			expect(response.status).toBe(200);
			expect(response.body.rooms).toHaveLength(ROOMS);
			expect(response.body.rooms[0].access).toBeDefined();
			expect(lookups).not.toHaveBeenCalled();
		});

		it('does not fetch every listed room again to decide what an admin session may see', async () => {
			const { accessToken } = await loginRootAdmin();
			const lookups = jest.spyOn(roomRepository, 'findByRoomId');

			const response = await getRooms({ maxItems: ROOMS }, undefined, accessToken);

			expect(response.status).toBe(200);
			expect(response.body.rooms).toHaveLength(ROOMS);
			expect(lookups).not.toHaveBeenCalled();
		});
	});
});
