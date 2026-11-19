import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { MeetExpiringRoom } from '@openvidu-meet/typings';
import { MeetRecordingStatus, MeetRoomStatus, MeetUserRole } from '@openvidu-meet/typings';
import ms from 'ms';
import { INTERNAL_CONFIG } from '../../../src/config/internal-config.js';
import { AnalyticsService } from '../../../src/services/analytics.service.js';
import type { RecordingAccessScope } from '../../../src/types/recording-projection.types.js';
import type { RoomAccessScope } from '../../../src/types/room-projection.types.js';

const noopLogger = { info: () => {}, warn: () => {}, debug: () => {}, error: () => {}, verbose: () => {} };

const NOW = 1_800_000_000_000;
const WINDOW = ms(INTERNAL_CONFIG.ANALYTICS_EXPIRING_ROOMS_WINDOW);

class FakeRoomRepository {
	roomsByStatus: Partial<Record<MeetRoomStatus, number>> = {};
	expiringCount = 0;
	nextExpiring: MeetExpiringRoom | null = null;
	expiringWindows: [number, number][] = [];
	nextExpiringWindows: [number, number][] = [];

	scopes: RoomAccessScope[] = [];

	countByStatusInScope(scope: RoomAccessScope): Promise<Partial<Record<MeetRoomStatus, number>>> {
		this.scopes.push(scope);
		return Promise.resolve(this.roomsByStatus);
	}

	countExpiringRooms(from: number, until: number, scope: RoomAccessScope): Promise<number> {
		this.expiringWindows.push([from, until]);
		this.scopes.push(scope);
		return Promise.resolve(this.expiringCount);
	}

	findNextExpiringRoom(from: number, until: number, scope: RoomAccessScope): Promise<MeetExpiringRoom | null> {
		this.nextExpiringWindows.push([from, until]);
		this.scopes.push(scope);
		return Promise.resolve(this.nextExpiring);
	}
}

class FakeRecordingRepository {
	recordingsByStatus: Partial<Record<MeetRecordingStatus, number>> = {};

	scopes: RecordingAccessScope[] = [];

	countByStatusInScope(scope: RecordingAccessScope): Promise<Partial<Record<MeetRecordingStatus, number>>> {
		this.scopes.push(scope);
		return Promise.resolve(this.recordingsByStatus);
	}
}

class FakeUserRepository {
	usersByRole: Partial<Record<MeetUserRole, number>> = {};

	countByRole(): Promise<Partial<Record<MeetUserRole, number>>> {
		return Promise.resolve(this.usersByRole);
	}
}

describe('AnalyticsService', () => {
	let rooms: FakeRoomRepository;
	let recordings: FakeRecordingRepository;
	let users: FakeUserRepository;
	let service: AnalyticsService;

	beforeEach(() => {
		jest.spyOn(Date, 'now').mockReturnValue(NOW);
		rooms = new FakeRoomRepository();
		recordings = new FakeRecordingRepository();
		users = new FakeUserRepository();
		service = new AnalyticsService(noopLogger as never, rooms as never, recordings as never, users as never);
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('reports each room status under its own figure, and all of them as the total', async () => {
		rooms.roomsByStatus = {
			[MeetRoomStatus.OPEN]: 31,
			[MeetRoomStatus.ACTIVE_MEETING]: 5,
			[MeetRoomStatus.CLOSED]: 12
		};

		const analytics = await service.getAnalytics();

		expect(analytics).toMatchObject({ totalRooms: 48, openRooms: 31, activeRooms: 5, closedRooms: 12 });
	});

	it('reports the recordings that exist, the complete ones, the ones in progress and the failed ones', async () => {
		recordings.recordingsByStatus = {
			[MeetRecordingStatus.STARTING]: 1,
			[MeetRecordingStatus.ENDING]: 1,
			[MeetRecordingStatus.COMPLETE]: 207,
			[MeetRecordingStatus.FAILED]: 3,
			[MeetRecordingStatus.ABORTED]: 1,
			[MeetRecordingStatus.LIMIT_REACHED]: 1
		};

		const analytics = await service.getAnalytics();

		expect(analytics).toMatchObject({
			totalRecordings: 214,
			completeRecordings: 207,
			recordingsInProgress: 2,
			failedRecordings: 5
		});
	});

	it('counts and looks up the expiring rooms in the window that starts now', async () => {
		await service.getAnalytics();

		expect(rooms.expiringWindows).toEqual([[NOW, NOW + WINDOW]]);
		expect(rooms.nextExpiringWindows).toEqual([[NOW, NOW + WINDOW]]);
		expect(WINDOW).toBe(ms('7d'));
	});

	it('reports the expiring rooms and the one that expires first', async () => {
		const next = { roomId: 'room-1', roomName: 'Weekly sync', autoDeletionDate: NOW + ms('2d') };
		rooms.expiringCount = 3;
		rooms.nextExpiring = next;

		const analytics = await service.getAnalytics();

		expect(analytics.roomsExpiringSoon).toBe(3);
		expect(analytics.nextExpiringRoom).toEqual(next);
	});

	it('leaves nextExpiringRoom out when no room is expiring', async () => {
		const analytics = await service.getAnalytics();

		expect(analytics.roomsExpiringSoon).toBe(0);
		expect(analytics).not.toHaveProperty('nextExpiringRoom');
	});

	it('counts every recording once, whatever its status', async () => {
		recordings.recordingsByStatus = Object.fromEntries(
			Object.values(MeetRecordingStatus).map((status) => [status, 1])
		) as Record<MeetRecordingStatus, number>;

		const analytics = await service.getAnalytics();

		expect(analytics.totalRecordings).toBe(Object.values(MeetRecordingStatus).length);
		expect(analytics.completeRecordings + analytics.recordingsInProgress + analytics.failedRecordings).toBe(
			analytics.totalRecordings
		);
	});

	it('counts the whole deployment in the analytics', async () => {
		await service.getAnalytics();

		expect([...rooms.scopes, ...recordings.scopes]).toEqual([{}, {}, {}, {}]);
	});

	it('counts the rooms and the recordings of the scope it is given in the summaries', async () => {
		const scope = { owner: 'maria', member: 'maria', userAccess: true };
		rooms.roomsByStatus = { [MeetRoomStatus.OPEN]: 2, [MeetRoomStatus.CLOSED]: 1 };
		recordings.recordingsByStatus = { [MeetRecordingStatus.COMPLETE]: 4, [MeetRecordingStatus.ABORTED]: 1 };

		const roomsSummary = await service.getRoomsSummary(scope);
		const recordingsSummary = await service.getRecordingsSummary({ roomOwner: 'maria' });

		expect(rooms.scopes).toEqual([scope, scope, scope]);
		expect(roomsSummary).toEqual({
			totalRooms: 3,
			activeRooms: 0,
			openRooms: 2,
			closedRooms: 1,
			roomsExpiringSoon: 0
		});
		expect(recordings.scopes).toEqual([{ roomOwner: 'maria' }]);
		expect(recordingsSummary).toEqual({
			totalRecordings: 5,
			completeRecordings: 4,
			recordingsInProgress: 0,
			failedRecordings: 1
		});
	});

	it('reports the users of each role, and all of them as the total', async () => {
		users.usersByRole = { [MeetUserRole.ADMIN]: 2, [MeetUserRole.ROOM_MANAGER]: 4, [MeetUserRole.ROOM_MEMBER]: 6 };

		await expect(service.getUsersSummary()).resolves.toEqual({
			totalUsers: 12,
			adminUsers: 2,
			roomManagerUsers: 4,
			roomMemberUsers: 6
		});
	});

	it('rethrows a repository failure', async () => {
		rooms.countByStatusInScope = () => Promise.reject(new Error('database down'));

		await expect(service.getAnalytics()).rejects.toThrow('database down');
	});
});
