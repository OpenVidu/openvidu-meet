import { afterAll, afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import type { MeetUser } from '@openvidu-meet/typings';
import { MeetUserRole } from '@openvidu-meet/typings';
import type { Express } from 'express';
import request from 'supertest';
import { container } from '../../../../src/config/dependency-injector.config.js';
import { INTERNAL_CONFIG } from '../../../../src/config/internal-config.js';
import { MEET_ENV } from '../../../../src/environment.js';
import { UserRepository } from '../../../../src/repositories/user.repository.js';
import {
	bulkDeleteUsers,
	createUser,
	deleteAllUsers,
	deleteUser,
	getFullPath,
	resetUserPassword,
	startTestServer
} from '../../../helpers/request-helpers.js';

const NOT_FOUND = { error: 'Not Found', message: 'The requested resource no longer exists' };

describe('Users API Tests', () => {
	let app: Express;
	let userRepository: UserRepository;
	let counter = 0;

	const newUser = async (): Promise<string> => {
		const userId = `lost_${Date.now().toString(36)}_${counter++}`;
		const response = await createUser({
			userId,
			name: 'Vanishing User',
			password: 'password123',
			role: MeetUserRole.ROOM_MANAGER
		});
		expect(response.status).toBe(201);
		return userId;
	};

	beforeAll(async () => {
		app = await startTestServer();
		userRepository = container.get(UserRepository);
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	afterAll(async () => {
		await deleteAllUsers();
	});

	describe('A user deleted by a concurrent request', () => {
		it('answers 404, not 500, when it vanishes between the existence check and a password reset', async () => {
			const userId = await newUser();
			const updatePartial = userRepository.updatePartial.bind(userRepository);
			jest.spyOn(userRepository, 'updatePartial').mockImplementationOnce(
				async (id: string, fields: Partial<MeetUser>) => {
					await userRepository.deleteByUserId(id);
					return updatePartial(id, fields);
				}
			);

			const response = await resetUserPassword(userId, 'newpassword123');

			expect(response.status).toBe(404);
			expect(response.body).toEqual(NOT_FOUND);
		});

		it('answers 404, not 500, when it vanishes between the existence check and its deletion', async () => {
			const userId = await newUser();
			const deleteByUserId = userRepository.deleteByUserId.bind(userRepository);
			jest.spyOn(userRepository, 'deleteByUserId').mockImplementationOnce(async (id: string) => {
				await deleteByUserId(id);
				return deleteByUserId(id);
			});

			const response = await deleteUser(userId);

			expect(response.status).toBe(404);
			expect(response.body).toEqual(NOT_FOUND);
		});

		it('still counts as deleted when a bulk deletion loses the race for all of its users', async () => {
			const userIds = [await newUser(), await newUser()];
			const deleteByUserIds = userRepository.deleteByUserIds.bind(userRepository);
			jest.spyOn(userRepository, 'deleteByUserIds').mockImplementationOnce(async (ids: string[]) => {
				await deleteByUserIds(ids);
				return deleteByUserIds(ids);
			});

			const response = await bulkDeleteUsers(userIds);

			expect(response.status).toBe(200);
			expect([...response.body.deleted].sort()).toEqual([...userIds].sort());
			expect(response.body.failed).toEqual([]);
		});

		it('never answers 500 to concurrent deletions of the same user', async () => {
			const userId = await newUser();

			const responses = await Promise.all(
				Array.from({ length: 8 }, () =>
					request(app)
						.delete(getFullPath(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/users/${userId}`))
						.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY)
				)
			);

			const statuses = responses.map((response) => response.status);
			expect(statuses.filter((status) => status === 200)).toHaveLength(1);
			expect(new Set(statuses)).toEqual(new Set([200, 404]));
		});
	});
});
