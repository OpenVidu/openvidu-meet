import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { MeetRoom, MeetRoomAccess, MeetRoomAccessConfig, MeetRoomConfig } from '@openvidu-meet/typings';
import {
	MeetingEndAction,
	MeetRoomDeletionErrorCode,
	MeetRoomDeletionPolicyWithMeeting,
	MeetRoomDeletionPolicyWithRecordings,
	MeetRoomDeletionSuccessCode,
	MeetRoomStatus
} from '@openvidu-meet/typings';
import type { Room as LivekitRoom } from 'livekit-server-sdk';
import ms from 'ms';
import { INTERNAL_CONFIG } from '../../../src/config/internal-config.js';
import { MeetRoomHelper } from '../../../src/helpers/room.helper.js';
import type { RoomRepository } from '../../../src/repositories/room.repository.js';
import type { LoggerService } from '../../../src/services/logger.service.js';
import { RequestSessionService } from '../../../src/services/request-session.service.js';
import { RoomService } from '../../../src/services/room.service.js';

/**
 * A request authenticated with a room member token has already read its room in the validator, so a
 * check that only gates a feature on that room's config takes it from there. Any other request, or a
 * check on another room, still reads the room from MongoDB.
 */
describe('RoomService.getRequestRoomConfig and getRequestRoomName', () => {
	const sharedConfig = { reactions: { enabled: true } } as MeetRoomConfig;
	const storedConfig = { reactions: { enabled: false } } as MeetRoomConfig;

	let findByRoomId: jest.Mock<(roomId: string, fields: readonly string[]) => Promise<Partial<MeetRoom> | null>>;
	let requestSessionService: RequestSessionService;
	let roomService: RoomService;

	const inRequestValidatedAgainst = <T>(roomId: string, read: () => Promise<T>) =>
		requestSessionService.run(() => {
			requestSessionService.setRoom({
				roomId,
				roomName: 'Shared name',
				rolesUpdatedAt: 0,
				config: sharedConfig,
				access: {} as MeetRoomAccess
			});
			return read();
		});

	beforeEach(() => {
		const logger = { debug: () => {} } as unknown as LoggerService;
		findByRoomId = jest.fn(async () => ({ config: storedConfig, roomName: 'Stored name' }));
		requestSessionService = new RequestSessionService(logger);
		roomService = new RoomService(
			logger,
			{ findByRoomId } as unknown as RoomRepository,
			{} as never,
			{} as never,
			{} as never,
			requestSessionService,
			{} as never,
			{} as never
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

	it('takes the name of the room the request was validated against without reading it again', async () => {
		const name = await inRequestValidatedAgainst('room-1', () => roomService.getRequestRoomName('room-1'));

		expect(name).toBe('Shared name');
		expect(findByRoomId).not.toHaveBeenCalled();
	});

	it('reads the name of any other room', async () => {
		const name = await inRequestValidatedAgainst('room-2', () => roomService.getRequestRoomName('room-1'));

		expect(name).toBe('Stored name');
		expect(findByRoomId).toHaveBeenCalledWith('room-1', ['roomName']);
	});
});

describe('RoomService.updateMeetRoomAccess (lock)', () => {
	const storedAccess = {
		anonymous: {},
		user: { enabled: false },
		lock: { enabled: true, message: 'Please wait' }
	} as unknown as MeetRoomAccess;

	const buildAccessService = (stored: MeetRoomAccess[], writesMatching: boolean[] = []) => {
		const updateIdleRoomAccess = jest.fn(async (_roomId: string, access: MeetRoomAccess) =>
			(writesMatching.shift() ?? true) ? { access } : null
		);
		const letEveryoneIn = jest.fn(async (_roomId: string) => {});
		const roomService = new RoomService(
			{ debug: () => {} } as unknown as LoggerService,
			{
				findByRoomId: async () => ({ access: stored.shift() ?? storedAccess, status: MeetRoomStatus.OPEN }),
				updateIdleRoomAccess
			} as unknown as RoomRepository,
			{} as never,
			{} as never,
			{} as never,
			{} as never,
			{ letEveryoneIn } as never,
			{} as never
		);
		return { roomService, updateIdleRoomAccess, letEveryoneIn };
	};

	const updateWith = async (access: MeetRoomAccessConfig) => {
		const { roomService, updateIdleRoomAccess } = buildAccessService([]);

		await roomService.updateMeetRoomAccess('room-1', access);
		return updateIdleRoomAccess.mock.calls[0][1];
	};

	it('keeps the stored message when the update leaves it out', async () => {
		expect((await updateWith({ lock: { enabled: true } })).lock).toEqual({
			enabled: true,
			message: 'Please wait'
		});
	});

	it('replaces the stored message with the one sent', async () => {
		expect((await updateWith({ lock: { enabled: true, message: 'Soon' } })).lock.message).toBe('Soon');
	});

	it('removes the stored message when the update sends null', async () => {
		const { lock } = await updateWith({ lock: { enabled: true, message: null } });

		expect(lock.enabled).toBe(true);
		expect(lock).toHaveProperty('message', undefined);
	});

	it('lets everyone waiting in when the update unlocks the room', async () => {
		const { roomService, letEveryoneIn } = buildAccessService([]);

		await roomService.updateMeetRoomAccess('room-1', { lock: { enabled: false } });

		expect(letEveryoneIn).toHaveBeenCalledWith('room-1');
	});

	it('lets nobody in when the room stays locked, or was already unlocked', async () => {
		const unlocked = { ...storedAccess, lock: { enabled: false } } as MeetRoomAccess;
		const { roomService, letEveryoneIn } = buildAccessService([storedAccess, unlocked]);

		await roomService.updateMeetRoomAccess('room-1', { lock: { enabled: true } });
		await roomService.updateMeetRoomAccess('room-1', { lock: { enabled: false } });

		expect(letEveryoneIn).not.toHaveBeenCalled();
	});

	it('reads the room again when the conditional write finds a meeting started', async () => {
		const { roomService, updateIdleRoomAccess } = buildAccessService([], [false]);

		await roomService.updateMeetRoomAccess('room-1', { lock: { enabled: true } });

		expect(updateIdleRoomAccess).toHaveBeenCalledTimes(2);
	});
});

describe('RoomService.deleteMeetRoom (a meeting that starts or ends while the room is deleted)', () => {
	const buildDeletionService = (statuses: MeetRoomStatus[], repository: Record<string, unknown>) => {
		const deleteAllByRoomId = jest.fn(async (_roomId: string) => {});
		const deleteChatMessages = jest.fn(async (_roomId: string) => {});
		const roomService = new RoomService(
			{ verbose: () => {}, debug: () => {} } as unknown as LoggerService,
			{ findByRoomId: async () => ({ status: statuses.shift() }), ...repository } as unknown as RoomRepository,
			{ deleteAllByRoomId } as never,
			{ hasRoomRecordings: async () => false } as never,
			{} as never,
			{} as never,
			{ closeRoom: async () => {} } as never,
			{ deleteAllByRoomId: deleteChatMessages } as never
		);
		return { roomService, deleteAllByRoomId, deleteChatMessages };
	};

	it('deletes the room at once when its meeting ended before the deletion could be scheduled', async () => {
		const deleteIdleRoom = jest.fn(async (_roomId: string) => true);
		const { roomService, deleteAllByRoomId, deleteChatMessages } = buildDeletionService(
			[MeetRoomStatus.ACTIVE_MEETING, MeetRoomStatus.OPEN],
			{ scheduleMeetingEndAction: async () => null, deleteIdleRoom }
		);

		const response = await roomService.deleteMeetRoom('room-1', {
			withMeeting: MeetRoomDeletionPolicyWithMeeting.WHEN_MEETING_ENDS
		});

		expect(response.successCode).toBe(MeetRoomDeletionSuccessCode.ROOM_DELETED);
		expect(deleteIdleRoom).toHaveBeenCalledWith('room-1');
		expect(deleteAllByRoomId).toHaveBeenCalledWith('room-1');
		expect(deleteChatMessages).toHaveBeenCalledWith('room-1');
	});

	it('answers 409 and keeps the room when its meeting started before the deletion was written', async () => {
		const { roomService, deleteAllByRoomId, deleteChatMessages } = buildDeletionService(
			[MeetRoomStatus.OPEN, MeetRoomStatus.ACTIVE_MEETING],
			{ deleteIdleRoom: async () => false }
		);

		await expect(roomService.deleteMeetRoom('room-1')).rejects.toMatchObject({
			statusCode: 409,
			name: MeetRoomDeletionErrorCode.ROOM_HAS_ACTIVE_MEETING
		});
		expect(deleteAllByRoomId).not.toHaveBeenCalled();
		expect(deleteChatMessages).not.toHaveBeenCalled();
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
			{} as never,
			{ closeRoom: async () => actions.push('endWaits') } as never,
			{ deleteAllByRoomId: async () => actions.push('deleteChatMessages') } as never
		);
		return { roomService, actions };
	};

	const idle = { activeMeeting: false, recordings: false };
	const withRecordings = { activeMeeting: false, recordings: true };
	const live = { activeMeeting: true, recordings: false };
	const liveWithRecordings = { activeMeeting: true, recordings: true };
	const replace = JSON.stringify({ replaceDeletion: true });

	it.each([
		[
			idle,
			M_FAIL,
			R_FAIL,
			MeetRoomDeletionSuccessCode.ROOM_DELETED,
			['deleteRoom', 'deleteMembers', 'deleteChatMessages', 'endWaits'],
			false
		],
		[
			idle,
			M_FORCE,
			R_CLOSE,
			MeetRoomDeletionSuccessCode.ROOM_DELETED,
			['deleteRoom', 'deleteMembers', 'deleteChatMessages', 'endWaits'],
			false
		],
		[
			withRecordings,
			M_FAIL,
			R_FORCE,
			MeetRoomDeletionSuccessCode.ROOM_AND_RECORDINGS_DELETED,
			['deleteRoom', 'deleteRecordings', 'deleteMembers', 'deleteChatMessages', 'endWaits'],
			false
		],
		[withRecordings, M_FAIL, R_CLOSE, MeetRoomDeletionSuccessCode.ROOM_CLOSED, ['status:closed', 'endWaits'], true],
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

/**
 * The LiveKit room a chat saver's join creates (the meeting closed between its check and its join) is
 * no meeting: LiveKit closes it by itself within a second, so a join token request waits for that
 * instead of handing it out, and deletes nothing, since requests deleting by name could delete the room
 * another one just created.
 */
describe('RoomService.createLivekitRoom (the room a chat saver created)', () => {
	const savingRoom = { name: 'room-1', metadata: MeetRoomHelper.CHAT_SAVER_ROOM_METADATA } as unknown as LivekitRoom;
	const meetingRoom = { name: 'room-1', metadata: '{"createdBy":"openviduMeet"}' } as unknown as LivekitRoom;
	const meetRoom = {
		roomId: 'room-1',
		roomName: 'Room',
		config: {},
		roles: {},
		access: {
			anonymous: { moderator: { enabled: true }, speaker: { enabled: true }, recording: { enabled: true } },
			user: { enabled: false },
			lock: { enabled: false }
		}
	};
	const quietLogger = { verbose: () => {}, debug: () => {}, info: () => {} } as unknown as LoggerService;

	/** LiveKit answers each read with the next room of `reads` (the last one from then on) */
	const build = (reads: (LivekitRoom | undefined)[]) => {
		const answers = [...reads];
		const livekitService = {
			findRoom: jest.fn(async () => (answers.length > 1 ? answers.shift() : answers[0])),
			createRoom: jest.fn(async () => meetingRoom),
			deleteRoom: jest.fn(async (_roomName: string) => true)
		};
		const roomService = new RoomService(
			quietLogger,
			{ findByRoomId: async () => meetRoom } as unknown as RoomRepository,
			{} as never,
			{} as never,
			livekitService as never,
			{} as never,
			{} as never,
			{} as never
		);
		return { roomService, livekitService };
	};

	beforeEach(() => {
		jest.useFakeTimers();
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	const settled = async (request: Promise<LivekitRoom>) => {
		await jest.advanceTimersByTimeAsync(ms(INTERNAL_CONFIG.CHAT_SAVER_ROOM_CLOSE_WAIT));
		return request;
	};

	it('waits for the room to close and then creates the meeting room, deleting nothing', async () => {
		const { roomService, livekitService } = build([savingRoom, savingRoom, savingRoom, undefined]);

		const room = await settled(roomService.createLivekitRoom('room-1'));

		expect(room).toBe(meetingRoom);
		expect(livekitService.findRoom).toHaveBeenCalledTimes(4);
		expect(livekitService.createRoom).toHaveBeenCalledTimes(1);
		expect(livekitService.deleteRoom).not.toHaveBeenCalled();
	});

	it('returns the meeting room another request created meanwhile, without creating one', async () => {
		const { roomService, livekitService } = build([savingRoom, meetingRoom]);

		const room = await settled(roomService.createLivekitRoom('room-1'));

		expect(room).toBe(meetingRoom);
		expect(livekitService.createRoom).not.toHaveBeenCalled();
		expect(livekitService.deleteRoom).not.toHaveBeenCalled();
	});

	it('reads the room every 250 milliseconds and deletes it, before creating the meeting room, only when it outlives 5 seconds', async () => {
		const { roomService, livekitService } = build([savingRoom]);

		const request = roomService.createLivekitRoom('room-1');
		await jest.advanceTimersByTimeAsync(4_999);
		expect(livekitService.deleteRoom).not.toHaveBeenCalled();
		await jest.advanceTimersByTimeAsync(1);
		await request;

		expect(livekitService.findRoom).toHaveBeenCalledTimes(1 + 5_000 / 250);
		expect(livekitService.deleteRoom).toHaveBeenCalledWith('room-1');
		expect(livekitService.createRoom).toHaveBeenCalledTimes(1);
	});

	it('deletes nothing when two requests find the room together and it closes', async () => {
		const reads = [savingRoom, savingRoom, undefined];
		const livekitService = {
			findRoom: jest.fn(async () => (reads.length > 1 ? reads.shift() : reads[0])),
			createRoom: jest.fn(async () => meetingRoom),
			deleteRoom: jest.fn(async (_roomName: string) => true)
		};
		const roomService = build([]).roomService;
		(roomService as unknown as { livekitService: unknown }).livekitService = livekitService;

		const requests = Promise.all([
			roomService.createLivekitRoom('room-1'),
			roomService.createLivekitRoom('room-1')
		]);
		await settled(requests as unknown as Promise<LivekitRoom>);

		expect(livekitService.deleteRoom).not.toHaveBeenCalled();
	});

	it('returns a meeting room that exists as it did, without waiting', async () => {
		const { roomService, livekitService } = build([meetingRoom]);

		await expect(roomService.createLivekitRoom('room-1')).resolves.toBe(meetingRoom);
		expect(livekitService.findRoom).toHaveBeenCalledTimes(1);
	});
});
