import { afterAll, afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { MeetRoomMemberRole } from '@openvidu-meet/typings';
import { container } from '../../../../src/config/dependency-injector.config.js';
import { RoomMemberRepository } from '../../../../src/repositories/room-member.repository.js';
import { RoomRepository } from '../../../../src/repositories/room.repository.js';
import {
	createRoom,
	createRoomMember,
	deleteAllRooms,
	deleteAllUsers,
	getRooms,
	loginRootAdmin,
	startTestServer
} from '../../../helpers/request-helpers.js';
import { setupTestUsers } from '../../../helpers/test-scenarios.js';

describe('Room API Tests', () => {
	const ROOMS = 8;
	let roomRepository: RoomRepository;
	let roomMemberRepository: RoomMemberRepository;

	beforeAll(async () => {
		await startTestServer();
		roomRepository = container.get(RoomRepository);
		roomMemberRepository = container.get(RoomMemberRepository);

		for (let i = 0; i < ROOMS; i++) {
			await createRoom({ roomName: `lookup-${i}` });
		}
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	afterAll(async () => {
		await deleteAllRooms();
		await deleteAllUsers();
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

	describe('Listing rooms as a user other than an administrator', () => {
		it('reads their memberships in every listed room at once, without fetching any room again', async () => {
			const { roomManager } = await setupTestUsers();
			const [owned, member, open] = await Promise.all([
				createRoom({ roomName: 'lookup-owned' }, roomManager.accessToken),
				createRoom({ roomName: 'lookup-member' }),
				createRoom({ roomName: 'lookup-open', access: { user: { enabled: true } } })
			]);
			await createRoomMember(member.roomId, {
				userId: roomManager.user.userId,
				baseRole: MeetRoomMemberRole.MODERATOR
			});
			const roomLookups = jest.spyOn(roomRepository, 'findByRoomId');
			const membershipLookups = jest.spyOn(roomMemberRepository, 'findByRoomAndMemberId');
			const membershipsInRooms = jest.spyOn(roomMemberRepository, 'findByMemberIdInRooms');

			const response = await getRooms(undefined, undefined, roomManager.accessToken);

			expect(response.status).toBe(200);
			expect(response.body.rooms.map((room: { roomId: string }) => room.roomId).sort()).toEqual(
				[owned.roomId, member.roomId, open.roomId].sort()
			);
			expect(roomLookups).not.toHaveBeenCalled();
			expect(membershipLookups).not.toHaveBeenCalled();
			expect(membershipsInRooms).toHaveBeenCalledTimes(1);
		});
	});
});
