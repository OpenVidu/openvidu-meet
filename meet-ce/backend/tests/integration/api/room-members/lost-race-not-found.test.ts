import { afterAll, afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import type { MeetRoomMember } from '@openvidu-meet/typings';
import { MeetRoomMemberRole } from '@openvidu-meet/typings';
import type { Express } from 'express';
import request from 'supertest';
import { container } from '../../../../src/config/dependency-injector.config.js';
import { INTERNAL_CONFIG } from '../../../../src/config/internal-config.js';
import { MEET_ENV } from '../../../../src/environment.js';
import { RoomMemberRepository } from '../../../../src/repositories/room-member.repository.js';
import {
	bulkDeleteRoomMembers,
	createRoom,
	createRoomMember,
	deleteAllRooms,
	deleteRoomMember,
	getFullPath,
	startTestServer,
	updateRoomMember
} from '../../../helpers/request-helpers.js';

const NOT_FOUND = { error: 'Not Found', message: 'The requested resource no longer exists' };

describe('Room Members API Tests', () => {
	let app: Express;
	let roomId: string;
	let roomMemberRepository: RoomMemberRepository;

	const newMember = async (name: string): Promise<string> => {
		const response = await createRoomMember(roomId, { name, baseRole: MeetRoomMemberRole.SPEAKER });
		expect(response.status).toBe(201);
		return response.body.memberId;
	};

	beforeAll(async () => {
		app = await startTestServer();
		roomMemberRepository = container.get(RoomMemberRepository);
		({ roomId } = await createRoom({ roomName: 'lost-race-members' }));
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	afterAll(async () => {
		await deleteAllRooms();
	});

	describe('A member deleted by a concurrent request', () => {
		it('answers 404, not 500, when it vanishes between the existence check and an update', async () => {
			const memberId = await newMember('Vanishing Member');
			const updatePartial = roomMemberRepository.updatePartial.bind(roomMemberRepository);
			jest.spyOn(roomMemberRepository, 'updatePartial').mockImplementationOnce(
				async (room: string, member: string, fields: Partial<MeetRoomMember>) => {
					await roomMemberRepository.deleteByRoomAndMemberId(room, member);
					return updatePartial(room, member, fields);
				}
			);

			const response = await updateRoomMember(roomId, memberId, { baseRole: MeetRoomMemberRole.MODERATOR });

			expect(response.status).toBe(404);
			expect(response.body).toEqual(NOT_FOUND);
		});

		it('answers 404, not 500, when it vanishes between the existence check and its deletion', async () => {
			const memberId = await newMember('Vanishing Member');
			const deleteByRoomAndMemberId = roomMemberRepository.deleteByRoomAndMemberId.bind(roomMemberRepository);
			jest.spyOn(roomMemberRepository, 'deleteByRoomAndMemberId').mockImplementationOnce(
				async (room: string, member: string) => {
					await deleteByRoomAndMemberId(room, member);
					return deleteByRoomAndMemberId(room, member);
				}
			);

			const response = await deleteRoomMember(roomId, memberId);

			expect(response.status).toBe(404);
			expect(response.body).toEqual(NOT_FOUND);
		});

		it('still counts as deleted when a bulk deletion loses the race for all of its members', async () => {
			const memberIds = [await newMember('Bulk Member 1'), await newMember('Bulk Member 2')];
			const deleteByRoomIdAndMemberIds =
				roomMemberRepository.deleteByRoomIdAndMemberIds.bind(roomMemberRepository);
			jest.spyOn(roomMemberRepository, 'deleteByRoomIdAndMemberIds').mockImplementationOnce(
				async (room: string, members: string[]) => {
					await deleteByRoomIdAndMemberIds(room, members);
					return deleteByRoomIdAndMemberIds(room, members);
				}
			);

			const response = await bulkDeleteRoomMembers(roomId, memberIds);

			expect(response.status).toBe(200);
			expect([...response.body.deleted].sort()).toEqual([...memberIds].sort());
			expect(response.body.failed).toEqual([]);
		});

		it('never answers 500 to concurrent deletions of the same member', async () => {
			const memberId = await newMember('Contended Member');

			const responses = await Promise.all(
				Array.from({ length: 8 }, () =>
					request(app)
						.delete(getFullPath(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms/${roomId}/members/${memberId}`))
						.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY)
				)
			);

			const statuses = responses.map((response) => response.status);
			expect(statuses.filter((status) => status === 200)).toHaveLength(1);
			expect(new Set(statuses)).toEqual(new Set([200, 404]));
		});
	});
});
