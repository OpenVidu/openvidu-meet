import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { MeetRoom, MeetRoomConfig, MeetRoomConfigOptions } from '@openvidu-meet/typings';
import {
	MeetingEndAction,
	MeetRoomDeletionErrorCode,
	MeetRoomDeletionPolicyWithMeeting,
	MeetRoomDeletionPolicyWithRecordings,
	MeetRoomDeletionSuccessCode,
	MeetRoomStatus
} from '@openvidu-meet/typings';
import type { RoomRepository } from '../../../src/repositories/room.repository.js';
import type { LoggerService } from '../../../src/services/logger.service.js';
import { RequestSessionService } from '../../../src/services/request-session.service.js';
import { RoomService } from '../../../src/services/room.service.js';

/**
 * A request authenticated with a room member token has already read its room in the validator, so a
 * check that only gates a feature on that room's config takes it from there. Any other request, or a
 * check on another room, still reads the room from MongoDB.
 */
describe('RoomService.getRequestRoomConfig', () => {
	const sharedConfig = { reactions: { enabled: true } } as MeetRoomConfig;
	const storedConfig = { reactions: { enabled: false } } as MeetRoomConfig;

	let findByRoomId: jest.Mock<(roomId: string, fields: readonly string[]) => Promise<Partial<MeetRoom> | null>>;
	let requestSessionService: RequestSessionService;
	let roomService: RoomService;

	const inRequestValidatedAgainst = (roomId: string, read: () => Promise<MeetRoomConfig>) =>
		requestSessionService.run(() => {
			requestSessionService.setRoom({ roomId, rolesUpdatedAt: 0, config: sharedConfig });
			return read();
		});

	beforeEach(() => {
		const logger = { debug: () => {} } as unknown as LoggerService;
		findByRoomId = jest.fn(async () => ({ config: storedConfig }));
		requestSessionService = new RequestSessionService(logger);
		roomService = new RoomService(
			logger,
			{ findByRoomId } as unknown as RoomRepository,
			{} as never,
			{} as never,
			{} as never,
			requestSessionService
		);
	});

	it('takes the config of the room the request was validated against without reading it again', async () => {
		const config = await inRequestValidatedAgainst('room-1', () => roomService.getRequestRoomConfig('room-1'));

		expect(config).toBe(sharedConfig);
		expect(findByRoomId).not.toHaveBeenCalled();
	});

	it('reads the config of any other room', async () => {
		const config = await inRequestValidatedAgainst('room-2', () => roomService.getRequestRoomConfig('room-1'));

		expect(config).toBe(storedConfig);
		expect(findByRoomId).toHaveBeenCalledWith('room-1', ['config']);
	});

	it('reads the config when no room member token authenticated the request', async () => {
		const config = await requestSessionService.run(() => roomService.getRequestRoomConfig('room-1'));

		expect(config).toBe(storedConfig);
		expect(findByRoomId).toHaveBeenCalledWith('room-1', ['config']);
	});

	it('answers 404 for a room that does not exist', async () => {
		findByRoomId.mockResolvedValue(null);

		await expect(
			inRequestValidatedAgainst('room-2', () => roomService.getRequestRoomConfig('room-1'))
		).rejects.toMatchObject({ statusCode: 404 });
	});
});

describe('RoomService.updateMeetRoomConfig (waiting room message)', () => {
	const storedConfig = {
		broadcast: { enabled: false, destinations: [] },
		lobby: { enabled: true, message: 'Please wait' }
	} as unknown as MeetRoomConfig;

	const updateWith = async (config: MeetRoomConfigOptions) => {
		const updateConfig = jest.fn(async (_roomId: string, written: MeetRoomConfig) => written);
		const roomService = new RoomService(
			{ debug: () => {} } as unknown as LoggerService,
			{
				findByRoomId: async () => ({ config: storedConfig, status: MeetRoomStatus.OPEN }),
				findBroadcastDestinationUrls: async () => ({}),
				updateConfig
			} as unknown as RoomRepository,
			{} as never,
			{} as never,
			{} as never,
			{} as never
		);

		await roomService.updateMeetRoomConfig('room-1', config);
		return updateConfig.mock.calls[0][1];
	};

	it('keeps the stored message when the update leaves it out', async () => {
		expect((await updateWith({ lobby: { enabled: true } })).lobby).toEqual({
			enabled: true,
			message: 'Please wait'
		});
	});

	it('replaces the stored message with the one sent', async () => {
		expect((await updateWith({ lobby: { enabled: true, message: 'Soon' } })).lobby.message).toBe('Soon');
	});

	it('removes the stored message when the update sends null', async () => {
		const { lobby } = await updateWith({ lobby: { enabled: true, message: null } });

		expect(lobby.enabled).toBe(true);
		expect(lobby).toHaveProperty('message', undefined);
	});
});

describe('RoomService.deleteMeetRoom (a meeting that starts or ends while the room is deleted)', () => {
	const buildDeletionService = (statuses: MeetRoomStatus[], repository: Record<string, unknown>) => {
		const deleteAllByRoomId = jest.fn(async (_roomId: string) => {});
		const roomService = new RoomService(
			{ verbose: () => {}, debug: () => {} } as unknown as LoggerService,
			{ findByRoomId: async () => ({ status: statuses.shift() }), ...repository } as unknown as RoomRepository,
			{ deleteAllByRoomId } as never,
			{ hasRoomRecordings: async () => false } as never,
			{} as never,
			{} as never
		);
		return { roomService, deleteAllByRoomId };
	};

	it('deletes the room at once when its meeting ended before the deletion could be scheduled', async () => {
		const deleteIdleRoom = jest.fn(async (_roomId: string) => true);
		const { roomService, deleteAllByRoomId } = buildDeletionService(
			[MeetRoomStatus.ACTIVE_MEETING, MeetRoomStatus.OPEN],
			{ scheduleMeetingEndAction: async () => null, deleteIdleRoom }
		);

		const response = await roomService.deleteMeetRoom('room-1', {
			withMeeting: MeetRoomDeletionPolicyWithMeeting.WHEN_MEETING_ENDS
		});

		expect(response.successCode).toBe(MeetRoomDeletionSuccessCode.ROOM_DELETED);
		expect(deleteIdleRoom).toHaveBeenCalledWith('room-1');
		expect(deleteAllByRoomId).toHaveBeenCalledWith('room-1');
	});

	it('answers 409 and keeps the room when its meeting started before the deletion was written', async () => {
		const { roomService, deleteAllByRoomId } = buildDeletionService(
			[MeetRoomStatus.OPEN, MeetRoomStatus.ACTIVE_MEETING],
			{ deleteIdleRoom: async () => false }
		);

		await expect(roomService.deleteMeetRoom('room-1')).rejects.toMatchObject({
			statusCode: 409,
			name: MeetRoomDeletionErrorCode.ROOM_HAS_ACTIVE_MEETING
		});
		expect(deleteAllByRoomId).not.toHaveBeenCalled();
	});
});

/**
 * Every combination of the room's state and the two deletion policies: what the deletion does to the
 * room, its meeting, its recordings and its members, and what it answers.
 */
describe('RoomService.deleteMeetRoom policies', () => {
	const { FORCE: M_FORCE, WHEN_MEETING_ENDS: M_WHEN_ENDS, FAIL: M_FAIL } = MeetRoomDeletionPolicyWithMeeting;
	const { FORCE: R_FORCE, CLOSE: R_CLOSE, FAIL: R_FAIL } = MeetRoomDeletionPolicyWithRecordings;
	const room = { roomId: 'room-1', roomName: 'Room 1', status: MeetRoomStatus.CLOSED } as MeetRoom;

	const build = (state: { activeMeeting: boolean; recordings: boolean }) => {
		const actions: string[] = [];
		const roomService = new RoomService(
			{ verbose: () => {}, debug: () => {} } as unknown as LoggerService,
			{
				findByRoomId: async () => ({
					status: state.activeMeeting ? MeetRoomStatus.ACTIVE_MEETING : MeetRoomStatus.OPEN
				}),
				deleteIdleRoom: async () => {
					actions.push('deleteRoom');
					return true;
				},
				scheduleMeetingEndAction: async (_roomId: string, action: MeetingEndAction, options: object) => {
					actions.push(`schedule:${action}:${JSON.stringify(options)}`);
					return room;
				},
				updateIdleRoomStatus: async (_roomId: string, status: MeetRoomStatus) => {
					actions.push(`status:${status}`);
					return room;
				}
			} as unknown as RoomRepository,
			{ deleteAllByRoomId: async () => actions.push('deleteMembers') } as never,
			{
				hasRoomRecordings: async () => state.recordings,
				deleteAllRoomRecordings: async () => actions.push('deleteRecordings')
			} as never,
			{ deleteRoom: async () => actions.push('endMeeting') } as never,
			{} as never
		);
		return { roomService, actions };
	};

	const idle = { activeMeeting: false, recordings: false };
	const withRecordings = { activeMeeting: false, recordings: true };
	const live = { activeMeeting: true, recordings: false };
	const liveWithRecordings = { activeMeeting: true, recordings: true };
	const replace = JSON.stringify({ replaceDeletion: true });

	it.each([
		[idle, M_FAIL, R_FAIL, MeetRoomDeletionSuccessCode.ROOM_DELETED, ['deleteRoom', 'deleteMembers'], false],
		[idle, M_FORCE, R_CLOSE, MeetRoomDeletionSuccessCode.ROOM_DELETED, ['deleteRoom', 'deleteMembers'], false],
		[
			withRecordings,
			M_FAIL,
			R_FORCE,
			MeetRoomDeletionSuccessCode.ROOM_AND_RECORDINGS_DELETED,
			['deleteRoom', 'deleteRecordings', 'deleteMembers'],
			false
		],
		[withRecordings, M_FAIL, R_CLOSE, MeetRoomDeletionSuccessCode.ROOM_CLOSED, ['status:closed'], true],
		[
			live,
			M_FORCE,
			R_FAIL,
			MeetRoomDeletionSuccessCode.ROOM_WITH_ACTIVE_MEETING_DELETED,
			[`schedule:delete:${replace}`, 'endMeeting'],
			false
		],
		[
			live,
			M_WHEN_ENDS,
			R_CLOSE,
			MeetRoomDeletionSuccessCode.ROOM_WITH_ACTIVE_MEETING_SCHEDULED_TO_BE_DELETED,
			[`schedule:delete:${replace}`],
			true
		],
		[
			liveWithRecordings,
			M_FORCE,
			R_FORCE,
			MeetRoomDeletionSuccessCode.ROOM_WITH_ACTIVE_MEETING_AND_RECORDINGS_DELETED,
			[`schedule:delete:${replace}`, 'endMeeting'],
			false
		],
		[
			liveWithRecordings,
			M_FORCE,
			R_CLOSE,
			MeetRoomDeletionSuccessCode.ROOM_WITH_ACTIVE_MEETING_CLOSED,
			[`schedule:close:${replace}`, 'endMeeting'],
			true
		],
		[
			liveWithRecordings,
			M_WHEN_ENDS,
			R_FORCE,
			MeetRoomDeletionSuccessCode.ROOM_WITH_ACTIVE_MEETING_AND_RECORDINGS_SCHEDULED_TO_BE_DELETED,
			[`schedule:delete:${replace}`],
			true
		],
		[
			liveWithRecordings,
			M_WHEN_ENDS,
			R_CLOSE,
			MeetRoomDeletionSuccessCode.ROOM_WITH_ACTIVE_MEETING_SCHEDULED_TO_BE_CLOSED,
			[`schedule:close:${replace}`],
			true
		]
	])(
		'%j with meeting %s and recordings %s answers %s',
		async (state, withMeeting, withRecordingsPolicy, successCode, expectedActions, returnsRoom) => {
			const { roomService, actions } = build(state);

			const response = await roomService.deleteMeetRoom('room-1', {
				withMeeting,
				withRecordings: withRecordingsPolicy
			});

			expect(response.successCode).toBe(successCode);
			expect(response.message).toMatch(/^Room 'room-1'/);
			expect(response.room).toEqual(returnsRoom ? room : undefined);
			expect(actions).toEqual(expectedActions);
		}
	);

	it.each([
		[live, M_FAIL, R_FORCE, MeetRoomDeletionErrorCode.ROOM_HAS_ACTIVE_MEETING],
		[liveWithRecordings, M_FAIL, R_FORCE, MeetRoomDeletionErrorCode.ROOM_WITH_RECORDINGS_HAS_ACTIVE_MEETING],
		[withRecordings, M_FORCE, R_FAIL, MeetRoomDeletionErrorCode.ROOM_HAS_RECORDINGS],
		[liveWithRecordings, M_FORCE, R_FAIL, MeetRoomDeletionErrorCode.ROOM_WITH_ACTIVE_MEETING_HAS_RECORDINGS],
		[
			liveWithRecordings,
			M_WHEN_ENDS,
			R_FAIL,
			MeetRoomDeletionErrorCode.ROOM_WITH_ACTIVE_MEETING_HAS_RECORDINGS_CANNOT_SCHEDULE_DELETION
		]
	])(
		'%j with meeting %s and recordings %s refuses with %s',
		async (state, withMeeting, withRecordingsPolicy, name) => {
			const { roomService, actions } = build(state);

			await expect(
				roomService.deleteMeetRoom('room-1', { withMeeting, withRecordings: withRecordingsPolicy })
			).rejects.toMatchObject({ statusCode: 409, name });
			expect(actions).toEqual([]);
		}
	);

	it('refuses by default to delete a room with an active meeting or with recordings', async () => {
		await expect(build(live).roomService.deleteMeetRoom('room-1')).rejects.toMatchObject({
			name: MeetRoomDeletionErrorCode.ROOM_HAS_ACTIVE_MEETING
		});
		await expect(build(withRecordings).roomService.deleteMeetRoom('room-1')).rejects.toMatchObject({
			name: MeetRoomDeletionErrorCode.ROOM_HAS_RECORDINGS
		});
	});

	it('returns only the requested fields of the room the deletion left', async () => {
		const { roomService } = build(withRecordings);

		const response = await roomService.deleteMeetRoom('room-1', {
			withRecordings: R_CLOSE,
			fields: ['roomId', 'status']
		});

		expect(response.room).toEqual({ roomId: 'room-1', status: MeetRoomStatus.CLOSED });
	});
});
