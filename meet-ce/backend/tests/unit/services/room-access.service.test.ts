import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import type { MeetRoomMemberPermissions, MeetUser } from '@openvidu-meet/typings';
import { MeetUserRole } from '@openvidu-meet/typings';
import { MeetRoomMemberHelper } from '../../../src/helpers/room-member.helper.js';
import type { RoomAccessFacts } from '../../../src/services/room-access.service.js';
import { RoomAccessService } from '../../../src/services/room-access.service.js';

const USER_ID = 'alice';
const ALL = MeetRoomMemberHelper.allPermissions();
const NONE = MeetRoomMemberHelper.noPermissions();
const SPEAKER = { ...NONE, chatRead: true, chatWrite: true } as MeetRoomMemberPermissions;
const MEMBERSHIP = { ...NONE, roomShareAccessLinks: true } as MeetRoomMemberPermissions;
const TOKEN = { ...NONE, mediaPublishAudio: true } as MeetRoomMemberPermissions;

const room = (roomId: string, { owner = 'admin', userAccess = false } = {}): RoomAccessFacts =>
	({
		roomId,
		owner,
		access: { user: { enabled: userAccess } },
		roles: { speaker: { permissions: SPEAKER } }
	}) as RoomAccessFacts;

class FakeRoomRepository {
	rooms = new Map<string, RoomAccessFacts>();
	reads = 0;

	findByRoomId(roomId: string): Promise<RoomAccessFacts | null> {
		this.reads++;
		return Promise.resolve(this.rooms.get(roomId) ?? null);
	}
}

class FakeRoomMemberRepository {
	memberships = new Map<string, MeetRoomMemberPermissions>();
	queriedRoomIds: string[][] = [];

	findByMemberIdInRooms(memberId: string, roomIds: string[]) {
		this.queriedRoomIds.push(roomIds);
		return Promise.resolve(
			roomIds
				.filter((roomId) => memberId === USER_ID && this.memberships.has(roomId))
				.map((roomId) => ({ roomId, effectivePermissions: this.memberships.get(roomId)! }))
		);
	}
}

class FakeRequestSession {
	user?: Pick<MeetUser, 'userId' | 'role'>;
	memberRoomId?: string;

	getAuthenticatedUser() {
		return this.user;
	}

	getRoomIdFromMember() {
		return this.memberRoomId;
	}

	getRoomMemberPermissions() {
		return TOKEN;
	}
}

describe('RoomAccessService granted permissions', () => {
	let rooms: FakeRoomRepository;
	let members: FakeRoomMemberRepository;
	let session: FakeRequestSession;
	let service: RoomAccessService;

	beforeEach(() => {
		rooms = new FakeRoomRepository();
		members = new FakeRoomMemberRepository();
		session = new FakeRequestSession();
		service = new RoomAccessService(rooms as never, members as never, session as never, {} as never);

		for (const facts of [
			room('owned', { owner: USER_ID }),
			room('member'),
			room('member-open', { userAccess: true }),
			room('open', { userAccess: true }),
			room('closed')
		]) {
			rooms.rooms.set(facts.roomId, facts);
		}

		members.memberships.set('member', MEMBERSHIP);
		members.memberships.set('member-open', MEMBERSHIP);
	});

	describe('for a user other than an admin', () => {
		beforeEach(() => {
			session.user = { userId: USER_ID, role: MeetUserRole.ROOM_MANAGER };
		});

		it('grants everything where they own the room, their membership where they have one, else the speaker role when the room lets users in', async () => {
			const permissions = await service.getGrantedRoomMemberPermissionsInRooms([...rooms.rooms.values()]);

			expect(permissions).toEqual([ALL, MEMBERSHIP, MEMBERSHIP, SPEAKER, NONE]);
		});

		it('reads the memberships of every room it does not own in one query, and never the rooms again', async () => {
			await service.getGrantedRoomMemberPermissionsInRooms([...rooms.rooms.values()]);

			expect(members.queriedRoomIds).toEqual([['member', 'member-open', 'open', 'closed']]);
			expect(rooms.reads).toBe(0);
		});

		it('reads no membership when they own every room', async () => {
			const permissions = await service.getGrantedRoomMemberPermissionsInRooms([rooms.rooms.get('owned')!]);

			expect(permissions).toEqual([ALL]);
			expect(members.queriedRoomIds).toEqual([]);
		});

		it('grants in one room what it grants in that room among others', async () => {
			const roomIds = [...rooms.rooms.keys()];
			const one = await Promise.all(roomIds.map((roomId) => service.getGrantedRoomMemberPermissions(roomId)));
			const many = await service.getGrantedRoomMemberPermissionsInRooms([...rooms.rooms.values()]);

			expect(one).toEqual(many);
		});

		it('rejects a room that does not exist with a 404', async () => {
			await expect(service.getGrantedRoomMemberPermissions('missing')).rejects.toMatchObject({ statusCode: 404 });
		});
	});

	describe('without reading any room or membership', () => {
		afterEach(() => {
			expect(rooms.reads).toBe(0);
			expect(members.queriedRoomIds).toEqual([]);
		});

		it('grants everything to an admin', async () => {
			session.user = { userId: USER_ID, role: MeetUserRole.ADMIN };

			expect(await service.getGrantedRoomMemberPermissionsInRooms([room('member'), room('closed')])).toEqual([
				ALL,
				ALL
			]);
			expect(await service.getGrantedRoomMemberPermissions('closed')).toEqual(ALL);
		});

		it('grants everything to a system process, with no user nor room member token', async () => {
			expect(await service.getGrantedRoomMemberPermissionsInRooms([room('closed')])).toEqual([ALL]);
			expect(await service.getGrantedRoomMemberPermissions('missing')).toEqual(ALL);
		});

		it('grants a room member token its permissions in its own room and nothing elsewhere, even beside a user', async () => {
			session.memberRoomId = 'member';
			session.user = { userId: USER_ID, role: MeetUserRole.ROOM_MANAGER };

			expect(await service.getGrantedRoomMemberPermissionsInRooms([room('member'), room('owned')])).toEqual([
				TOKEN,
				NONE
			]);
			expect(await service.getGrantedRoomMemberPermissions('owned')).toEqual(NONE);
		});
	});
});
