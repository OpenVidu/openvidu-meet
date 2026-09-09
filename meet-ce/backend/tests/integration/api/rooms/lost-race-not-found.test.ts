import { afterAll, afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import type { MeetRoom } from '@openvidu-meet/typings';
import type { Express } from 'express';
import request from 'supertest';
import { container } from '../../../../src/config/dependency-injector.config.js';
import { INTERNAL_CONFIG } from '../../../../src/config/internal-config.js';
import { MEET_ENV } from '../../../../src/environment.js';
import { RoomRepository } from '../../../../src/repositories/room.repository.js';
import {
	bulkDeleteRooms,
	createRoom,
	deleteAllRooms,
	deleteRoom,
	getFullPath,
	startTestServer,
	updateRoomAccessConfig
} from '../../../helpers/request-helpers.js';

const NOT_FOUND = { error: 'Not Found', message: 'The requested resource no longer exists' };

describe('Room API Tests', () => {
	let app: Express;
	let roomRepository: RoomRepository;

	beforeAll(async () => {
		app = await startTestServer();
		roomRepository = container.get(RoomRepository);
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	afterAll(async () => {
		await deleteAllRooms();
	});

	describe('A room deleted by a concurrent request', () => {
		const deletedRightBefore = (roomId: string) => {
			const deleteByRoomId = roomRepository.deleteByRoomId.bind(roomRepository);
			jest.spyOn(roomRepository, 'deleteByRoomId').mockImplementation(async (id: string) => {
				if (id === roomId) {
					await deleteByRoomId(id);
				}

				return deleteByRoomId(id);
			});
		};

		it('answers 404, not 500, when it vanishes between the existence check and its deletion', async () => {
			const { roomId } = await createRoom({ roomName: 'vanishing-room' });
			deletedRightBefore(roomId);

			const response = await deleteRoom(roomId);

			expect(response.status).toBe(404);
			expect(response.body).toEqual(NOT_FOUND);
		});

		it('answers 404, not 500, when it vanishes between the existence check and an access update', async () => {
			const { roomId, access } = await createRoom({ roomName: 'vanishing-room' });
			const updatePartial = roomRepository.updatePartial.bind(roomRepository);
			jest.spyOn(roomRepository, 'updatePartial').mockImplementationOnce(
				async (id: string, fields: Partial<MeetRoom>) => {
					await roomRepository.deleteByRoomId(id);
					return updatePartial(id, fields);
				}
			);

			const response = await updateRoomAccessConfig(roomId, {
				...access,
				user: { enabled: false }
			});

			expect(response.status).toBe(404);
			expect(response.body).toEqual(NOT_FOUND);
		});

		it('is reported as not found, not as an internal error, by a bulk deletion', async () => {
			const { roomId } = await createRoom({ roomName: 'vanishing-room' });
			const survivor = await createRoom({ roomName: 'surviving-room' });
			deletedRightBefore(roomId);

			const response = await bulkDeleteRooms([roomId, survivor.roomId]);

			expect(response.status).toBe(400);
			expect(response.body.failed).toEqual([{ roomId, ...NOT_FOUND }]);
			expect(response.body.deleted.map((room: { roomId: string }) => room.roomId)).toEqual([survivor.roomId]);
		});

		it('never answers 500 to concurrent deletions of the same room', async () => {
			const { roomId } = await createRoom({ roomName: 'contended-room' });

			const responses = await Promise.all(
				Array.from({ length: 8 }, () =>
					request(app)
						.delete(getFullPath(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms/${roomId}`))
						.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY)
				)
			);

			const statuses = responses.map((response) => response.status);
			expect(statuses.filter((status) => status === 200)).toHaveLength(1);
			expect(new Set(statuses)).toEqual(new Set([200, 404]));
		});
	});
});
