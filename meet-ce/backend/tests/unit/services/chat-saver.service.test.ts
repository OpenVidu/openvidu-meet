import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Room, TextStreamReader } from '@livekit/rtc-node';
import type { MeetRoomMemberPermissions } from '@openvidu-meet/typings';
import {
	MEET_CHAT_SAVER_IDENTITY,
	MEET_PERMISSION_KEYS,
	MeetChatStreamAttribute,
	MeetParticipantType,
	MeetRoomMemberUIBadge
} from '@openvidu-meet/typings';
import { jwtDecode } from 'jwt-decode';
import type { ParticipantInfo, Room as LivekitRoom } from 'livekit-server-sdk';
import ms from 'ms';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { INTERNAL_CONFIG } from '../../../src/config/internal-config.js';
import { MEET_ENV } from '../../../src/environment.js';
import { MeetRoomHelper } from '../../../src/helpers/room.helper.js';
import { MeetChatMessageModel } from '../../../src/models/mongoose-schemas/chat-message.schema.js';
import { ChatMessageRepository } from '../../../src/repositories/chat-message.repository.js';
import { ChatSaverService } from '../../../src/services/chat-saver.service.js';
import type { LoggerService } from '../../../src/services/logger.service.js';

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), verbose: jest.fn() };

const permissions = Object.fromEntries(
	MEET_PERMISSION_KEYS.map((key) => [key, true])
) as unknown as MeetRoomMemberPermissions;

const meetMetadata = (chat: { enabled: boolean; persist?: boolean }, e2ee = false, startDate?: number) =>
	JSON.stringify({
		createdBy: MEET_ENV.NAME_ID,
		startDate,
		roomOptions: { config: { chat, e2ee: { enabled: e2ee } } }
	});

const SAVING = meetMetadata({ enabled: true, persist: true }, false, 5000);
const NOT_SAVING = meetMetadata({ enabled: true, persist: false }, false, 5000);

const memberMetadata = (fields: Record<string, unknown> = {}) =>
	JSON.stringify({ iat: 1, roomId: 'room-1', permissions, badge: MeetRoomMemberUIBadge.OTHER, ...fields });

const MESSAGE_ID = '3f2b8f0e-5a7c-4a8e-9a43-8f6f0c3f6a11';

class FakeRoom extends EventEmitter {
	metadata: string | undefined = SAVING;
	creationTime = new Date(7000);
	sid = 'RM_meeting-1';
	localParticipant = { sid: 'PA_saver' };
	remoteParticipants = new Map<string, { name: string; metadata: string }>();
	textHandler?: (reader: TextStreamReader, sender: { identity: string }) => void;
	connect = jest.fn(async (_url: string, _token: string, _options: Record<string, unknown>) => {});
	disconnect = jest.fn(async () => {
		this.emit('disconnected', 1);
	});

	async getSid() {
		return this.sid;
	}

	registerTextStreamHandler(topic: string, handler: typeof this.textHandler) {
		expect(topic).toBe('chat');
		this.textHandler = handler;
	}
}

class TestableChatSaverService extends ChatSaverService {
	rooms: FakeRoom[] = [];
	nextRoom = () => new FakeRoom();

	protected override async createRoom(): Promise<Room> {
		const room = this.nextRoom();
		this.rooms.push(room);
		return room as unknown as Room;
	}
}

const reader = (text: Promise<string>, messageId: string | null = MESSAGE_ID) => {
	const close = jest.fn(async () => {});
	const attributes = messageId === null ? {} : { [MeetChatStreamAttribute.MESSAGE_ID]: messageId };
	return { info: { attributes }, readAll: () => text, close } as unknown as TextStreamReader & { close: jest.Mock };
};

const settle = () => new Promise((resolve) => setImmediate(resolve));

describe('ChatSaverService', () => {
	let livekitService: {
		findRoom: jest.Mock<() => Promise<Partial<LivekitRoom> | undefined>>;
		findParticipant: jest.Mock<() => Promise<Partial<ParticipantInfo> | undefined>>;
	};
	let frontendEventService: { sendChatMessageSavedSignal: jest.Mock<(...args: string[]) => Promise<void>> };
	let chatMessageRepository: { save: jest.Mock<(message: unknown) => Promise<void>> };
	let service: TestableChatSaverService;

	beforeEach(() => {
		jest.clearAllMocks();
		livekitService = {
			findRoom: jest.fn(async () => ({ metadata: SAVING })),
			findParticipant: jest.fn(async () => undefined)
		};
		frontendEventService = { sendChatMessageSavedSignal: jest.fn(async (..._args: string[]) => {}) };
		chatMessageRepository = { save: jest.fn(async () => {}) };
		service = new TestableChatSaverService(
			logger as unknown as LoggerService,
			livekitService as never,
			frontendEventService as never,
			chatMessageRepository as never
		);
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	describe('ensureSaver', () => {
		it('joins a meeting that saves its chat, hidden and subscribe-only, reading streams of at most 2,000 bytes', async () => {
			await service.ensureSaver('room-1');

			const [room] = service.rooms;
			expect(room.connect).toHaveBeenCalledTimes(1);
			const [url, token, options] = room.connect.mock.calls[0];
			expect(url).toBe(MEET_ENV.LIVEKIT_URL_PRIVATE);
			expect(options).toEqual({
				autoSubscribe: false,
				dynacast: false,
				dataStream: { maxPayloadByteLength: 2000 }
			});

			const claims = jwtDecode<Record<string, unknown>>(token);
			expect(claims).toMatchObject({
				sub: MEET_CHAT_SAVER_IDENTITY,
				kind: 'agent',
				attributes: { 'meet.role': 'chatSaver' },
				video: {
					roomJoin: true,
					room: 'room-1',
					hidden: true,
					agent: true,
					canSubscribe: true,
					canPublish: false,
					canPublishData: false
				},
				roomConfig: { emptyTimeout: 1 }
			});
			expect(MeetRoomHelper.isChatSaverRoomMetadata((claims.roomConfig as { metadata: string }).metadata)).toBe(
				true
			);
		});

		it('uses the metadata the caller has instead of reading the room', async () => {
			await service.ensureSaver('room-1', SAVING);

			expect(livekitService.findRoom).not.toHaveBeenCalled();
			expect(service.rooms).toHaveLength(1);
		});

		it.each([
			['chat is off', meetMetadata({ enabled: false, persist: true })],
			['saving is off', NOT_SAVING],
			['the room is encrypted', meetMetadata({ enabled: true, persist: true }, true)],
			[
				"the room is not Meet's",
				JSON.stringify({
					createdBy: 'other',
					roomOptions: { config: { chat: { enabled: true, persist: true } } }
				})
			],
			["the room is the one a saver's join created", MeetRoomHelper.CHAT_SAVER_ROOM_METADATA],
			['the room has no metadata', undefined]
		])(
			'does not join when %s in the room metadata, whatever the stored config of the Meet room says',
			async (_, metadata) => {
				livekitService.findRoom.mockResolvedValue({ metadata });

				await service.ensureSaver('room-1');

				expect(service.rooms).toHaveLength(0);
			}
		);

		it('does not join a room LiveKit does not have', async () => {
			livekitService.findRoom.mockResolvedValue(undefined);

			await service.ensureSaver('room-1');

			expect(service.rooms).toHaveLength(0);
		});

		it('does not join when LiveKit lists a saver in the room, whichever replica holds it', async () => {
			livekitService.findParticipant.mockResolvedValue({ sid: 'PA_other' });

			await service.ensureSaver('room-1');

			expect(service.rooms).toHaveLength(0);
		});

		it('does not join, and logs an error naming the room, when it cannot tell whether a saver is there', async () => {
			livekitService.findParticipant.mockRejectedValue(new Error('LiveKit down'));

			await service.ensureSaver('room-1');

			expect(service.rooms).toHaveLength(0);
			expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("'room-1'"), expect.any(Error));
		});

		it('opens one connection when several triggers arrive together, checking the room again after it', async () => {
			livekitService.findParticipant.mockResolvedValueOnce(undefined).mockResolvedValue({ sid: 'PA_saver' });

			await Promise.all([
				service.ensureSaver('room-1'),
				service.ensureSaver('room-1'),
				service.ensureSaver('room-1')
			]);
			await settle();

			expect(service.rooms).toHaveLength(1);
			expect(livekitService.findParticipant).toHaveBeenCalledTimes(2);
		});

		it('joins on a trigger that arrived while another one decided to join nothing', async () => {
			livekitService.findParticipant.mockResolvedValueOnce({ sid: 'PA_leaving' }).mockResolvedValue(undefined);

			await Promise.all([service.ensureSaver('room-1'), service.ensureSaver('room-1')]);
			await settle();

			expect(service.rooms).toHaveLength(1);
			expect(service.rooms[0].textHandler).toBeDefined();
		});

		it('keeps its connection while LiveKit lists the saver, whatever session id a reconnection gave it', async () => {
			await service.ensureSaver('room-1');
			livekitService.findParticipant.mockResolvedValue({ sid: 'PA_after_reconnection' });

			await service.ensureSaver('room-1');

			expect(service.rooms).toHaveLength(1);
			expect(service.rooms[0].disconnect).not.toHaveBeenCalled();
		});

		it('replaces a connection LiveKit no longer lists', async () => {
			await service.ensureSaver('room-1');

			await service.ensureSaver('room-1');

			expect(service.rooms).toHaveLength(2);
			expect(service.rooms[0].disconnect).toHaveBeenCalledTimes(1);
		});

		it('keeps its connection, and joins nothing, while LiveKit lists a saver, whichever replica holds it', async () => {
			await service.ensureSaver('room-1');
			livekitService.findParticipant.mockResolvedValue({ sid: 'PA_other' });

			await service.ensureSaver('room-1');

			expect(service.rooms).toHaveLength(1);
			expect(service.rooms[0].disconnect).not.toHaveBeenCalled();
		});

		it('logs the error of a failed connection naming the room, and joins again on the next trigger', async () => {
			const failure = new Error('no WebRTC reach');
			service.nextRoom = () => {
				const room = new FakeRoom();
				room.connect.mockRejectedValueOnce(failure);
				room.disconnect.mockRejectedValueOnce(new Error('handle not found'));
				return room;
			};

			await service.ensureSaver('room-1');

			expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("'room-1'"), failure);
			expect(service.rooms[0].disconnect).toHaveBeenCalled();

			service.nextRoom = () => new FakeRoom();
			await service.ensureSaver('room-1');

			expect(service.rooms[1].textHandler).toBeDefined();
		});

		it('leaves, storing nothing, a connection that landed in the room a saver created', async () => {
			service.nextRoom = () =>
				Object.assign(new FakeRoom(), { metadata: MeetRoomHelper.CHAT_SAVER_ROOM_METADATA });

			await service.ensureSaver('room-1');

			const [room] = service.rooms;
			expect(room.disconnect).toHaveBeenCalledTimes(1);
			expect(room.textHandler).toBeUndefined();
			expect(chatMessageRepository.save).not.toHaveBeenCalled();
		});

		it('stays in a new meeting of the room that saves its chat, storing under its sid', async () => {
			service.nextRoom = () => Object.assign(new FakeRoom(), { sid: 'RM_meeting-2' });
			await service.ensureSaver('room-1');
			const [room] = service.rooms;
			room.remoteParticipants.set('alice', { name: 'Alice', metadata: memberMetadata({ userId: 'u1' }) });

			room.textHandler!(reader(Promise.resolve('hello')), { identity: 'alice' });
			await settle();

			expect(room.disconnect).not.toHaveBeenCalled();
			expect(chatMessageRepository.save).toHaveBeenCalledWith(
				expect.objectContaining({ meetingId: 'RM_meeting-2' })
			);
		});

		it('leaves a new meeting of the room that does not save its chat', async () => {
			service.nextRoom = () => Object.assign(new FakeRoom(), { metadata: NOT_SAVING });

			await service.ensureSaver('room-1');

			expect(service.rooms[0].disconnect).toHaveBeenCalledTimes(1);
			expect(service.rooms[0].textHandler).toBeUndefined();
		});

		it('leaves and checks the room again when a reconnection changes the room sid', async () => {
			await service.ensureSaver('room-1');
			const [first] = service.rooms;

			first.emit('roomSidChanged', 'RM_meeting-1');
			await settle();
			expect(service.rooms).toHaveLength(1);

			first.emit('roomSidChanged', 'RM_meeting-2');
			await settle();

			expect(first.disconnect).toHaveBeenCalledTimes(1);
			expect(service.rooms).toHaveLength(2);
		});

		it('forgets a connection LiveKit ended, so the next trigger joins again', async () => {
			await service.ensureSaver('room-1');
			service.rooms[0].emit('disconnected', 5);

			await service.ensureSaver('room-1');

			expect(service.rooms).toHaveLength(2);
			expect(service.rooms[0].disconnect).not.toHaveBeenCalled();
		});
	});

	describe('native binding', () => {
		it('is initialized without forwarding its logs, which nothing reads, to every room', () => {
			const livekitInitialize = jest.fn();
			const bindings = jest.requireActual<Record<string, unknown>>('@livekit/rtc-ffi-bindings');
			jest.doMock('@livekit/rtc-ffi-bindings', () => ({ ...bindings, livekitInitialize }));
			const ffiClientPath = join(
				dirname(createRequire(import.meta.url).resolve('@livekit/rtc-node')),
				'ffi_client.cjs'
			);
			const { FfiClient } = jest.requireActual<{ FfiClient: { instance: unknown } }>(ffiClientPath);

			void FfiClient.instance;

			expect(livekitInitialize).toHaveBeenCalledWith(expect.any(Function), false, expect.any(String));
		});
	});

	describe('leaveAll', () => {
		it('disconnects the saver of every meeting this replica saves', async () => {
			await service.ensureSaver('room-1');
			await service.ensureSaver('room-2');

			await service.leaveAll();

			expect(service.rooms.map((room) => room.disconnect.mock.calls.length)).toEqual([1, 1]);
		});
	});

	describe('leave', () => {
		it('disconnects the saver of the meeting it serves only', async () => {
			await service.ensureSaver('room-1');

			await service.leave('room-1', 'RM_another-meeting');
			expect(service.rooms[0].disconnect).not.toHaveBeenCalled();

			await service.leave('room-1', 'RM_meeting-1');
			expect(service.rooms[0].disconnect).toHaveBeenCalledTimes(1);
		});
	});

	describe('messages', () => {
		let room: FakeRoom;

		beforeEach(async () => {
			await service.ensureSaver('room-1');
			room = service.rooms[0];
			room.remoteParticipants.set('alice', { name: 'Alice', metadata: memberMetadata({ userId: 'u1' }) });
		});

		const receive = async (
			text: Promise<string> | string,
			{ messageId = MESSAGE_ID as string | null, identity = 'alice' } = {}
		) => {
			const stream = reader(Promise.resolve(text), messageId);
			room.textHandler!(stream, { identity });
			await settle();
			return stream;
		};
		const stored = () => chatMessageRepository.save.mock.calls.map(([message]) => message);

		it('stores the message with its sender as LiveKit reports it and confirms it to its sender', async () => {
			await receive('hello');

			expect(stored()).toEqual([
				{
					roomId: 'room-1',
					meetingId: 'RM_meeting-1',
					meetingStartDate: 5000,
					messageId: MESSAGE_ID,
					channel: 'all',
					text: 'hello',
					participant: { identity: 'alice', name: 'Alice', type: MeetParticipantType.USER }
				}
			]);
			expect(frontendEventService.sendChatMessageSavedSignal).toHaveBeenCalledWith('room-1', 'alice', MESSAGE_ID);
		});

		it('takes the start of the meeting from the room creation time when its metadata carries none', async () => {
			const withoutStart = meetMetadata({ enabled: true, persist: true });
			service.nextRoom = () => Object.assign(new FakeRoom(), { metadata: withoutStart });
			await service.ensureSaver('room-2', withoutStart);
			const [, second] = service.rooms;
			second.remoteParticipants.set('alice', { name: 'Alice', metadata: memberMetadata() });

			second.textHandler!(reader(Promise.resolve('hello')), { identity: 'alice' });
			await settle();

			expect(stored()).toEqual([expect.objectContaining({ roomId: 'room-2', meetingStartDate: 7000 })]);
		});

		it.each([
			['a user', { userId: 'u1' }, MeetParticipantType.USER],
			['an identified guest', { memberId: 'm1' }, MeetParticipantType.IDENTIFIED_GUEST],
			['an anonymous participant', {}, MeetParticipantType.ANONYMOUS]
		])('stores the message of %s with its type', async (_, fields, type) => {
			room.remoteParticipants.set('bob', { name: 'Bob', metadata: memberMetadata(fields) });

			await receive('hi', { identity: 'bob' });

			expect(stored()).toEqual([
				expect.objectContaining({ participant: { identity: 'bob', name: 'Bob', type } })
			]);
		});

		it('stores the message of the sender it keeps, under the identity of the stream and not any other the text claims', async () => {
			await receive('I am alice', { identity: 'mallory' });
			expect(stored()).toEqual([]);

			room.remoteParticipants.set('mallory', { name: 'Mallory', metadata: memberMetadata() });
			await receive('I am alice', { identity: 'mallory' });

			expect(stored()).toEqual([
				expect.objectContaining({ participant: expect.objectContaining({ identity: 'mallory' }) })
			]);
		});

		it.each(['$5 off', '$$ROOT', '{ $literal: 1 }'])(
			'stores a text and a sender name starting with $ as sent: %s',
			async (text) => {
				room.remoteParticipants.set('bob', { name: text, metadata: memberMetadata() });

				await receive(text, { identity: 'bob' });

				expect(stored()).toEqual([
					expect.objectContaining({ text, participant: expect.objectContaining({ name: text }) })
				]);
			}
		);

		it('leaves a message of an unknown sender unconfirmed, for its sender to send again', async () => {
			await receive('hello', { identity: 'nobody' });

			expect(stored()).toEqual([]);
			expect(frontendEventService.sendChatMessageSavedSignal).not.toHaveBeenCalled();
		});

		it.each([
			['no id', null],
			['an id that is not a UUID', 'message-1']
		])('drops a message with %s, unconfirmed', async (_, messageId) => {
			await receive('hello', { messageId });

			expect(stored()).toEqual([]);
			expect(frontendEventService.sendChatMessageSavedSignal).not.toHaveBeenCalled();
		});

		it.each([
			['a line break', '\n'],
			['whitespace', ' \t  '],
			['501 characters', 'x'.repeat(501)]
		])('confirms %s without storing it, so it does not hold its sender back', async (_, text) => {
			await receive(text);

			expect(stored()).toEqual([]);
			expect(frontendEventService.sendChatMessageSavedSignal).toHaveBeenCalledWith('room-1', 'alice', MESSAGE_ID);
		});

		it('stores a message of exactly 500 characters', async () => {
			await receive('x'.repeat(500));

			expect(stored()).toHaveLength(1);
		});

		it('drops a stream the binding ended with an error because it was over 2,000 bytes, unconfirmed', async () => {
			const stream = reader(Promise.reject(new Error('stream payload exceeds the maximum size')));
			room.textHandler!(stream, { identity: 'alice' });
			await settle();

			expect(stored()).toEqual([]);
			expect(frontendEventService.sendChatMessageSavedSignal).not.toHaveBeenCalled();
			expect(stream.close).toHaveBeenCalled();
		});

		it('stops reading a stream that has not ended after 10 seconds and drops it, unconfirmed', async () => {
			jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
			const stream = reader(new Promise<string>(() => {}));

			room.textHandler!(stream, { identity: 'alice' });
			await jest.advanceTimersByTimeAsync(ms(INTERNAL_CONFIG.CHAT_SAVER_STREAM_TIMEOUT) - 1);
			expect(stream.close).not.toHaveBeenCalled();
			await jest.advanceTimersByTimeAsync(1);
			await settle();

			expect(stream.close).toHaveBeenCalledTimes(1);
			expect(stored()).toEqual([]);
			expect(frontendEventService.sendChatMessageSavedSignal).not.toHaveBeenCalled();
		});

		it('sends no confirmation when the write fails, and stores the resend', async () => {
			chatMessageRepository.save.mockRejectedValueOnce(new Error('MongoDB down'));

			await receive('hello');
			expect(frontendEventService.sendChatMessageSavedSignal).not.toHaveBeenCalled();

			await receive('hello');
			expect(frontendEventService.sendChatMessageSavedSignal).toHaveBeenCalledTimes(1);
		});

		it('keeps the same message id of two senders apart', async () => {
			room.remoteParticipants.set('bob', { name: 'Bob', metadata: memberMetadata() });

			await receive('from alice');
			await receive('from bob', { identity: 'bob' });

			expect(
				stored().map((message) => (message as { participant: { identity: string } }).participant.identity)
			).toEqual(['alice', 'bob']);
			expect(frontendEventService.sendChatMessageSavedSignal.mock.calls).toEqual([
				['room-1', 'alice', MESSAGE_ID],
				['room-1', 'bob', MESSAGE_ID]
			]);
		});
	});
});

/**
 * The write is one upsert whose stage reads a string starting with `$` as a field path unless it is
 * wrapped in `$literal`, and whose filter lets only a message not stored yet through, so a resend
 * finds nothing to update, tries an insert and fails on the unique key.
 */
describe('ChatMessageRepository.save', () => {
	const message = {
		roomId: 'room-1',
		meetingId: 'RM_1',
		meetingStartDate: 5000,
		messageId: MESSAGE_ID,
		channel: 'all' as const,
		text: '$5 off',
		participant: { identity: 'alice', name: '$$ROOT', type: MeetParticipantType.USER }
	};
	const repository = new ChatMessageRepository(logger as unknown as LoggerService);
	let updateOne: jest.SpiedFunction<typeof MeetChatMessageModel.updateOne>;

	const failingWith = (error: unknown) => {
		updateOne.mockReturnValue({
			exec: async () => {
				throw error;
			}
		} as never);
	};

	beforeEach(() => {
		jest.clearAllMocks();
		updateOne = jest.spyOn(MeetChatMessageModel, 'updateOne').mockReturnValue({ exec: async () => ({}) } as never);
	});

	afterEach(() => {
		updateOne.mockRestore();
	});

	it('wraps every value of the stage but the send date in $literal, and takes the send date from MongoDB', async () => {
		await repository.save(message);

		const [filter, pipeline, options] = updateOne.mock.calls[0] as unknown as [
			Record<string, unknown>,
			[{ $set: Record<string, unknown> }],
			Record<string, unknown>
		];
		expect(filter).toEqual({
			roomId: 'room-1',
			'participant.identity': 'alice',
			messageId: MESSAGE_ID,
			sendDate: { $exists: false }
		});
		expect(options).toEqual({ upsert: true, updatePipeline: true });
		expect(pipeline).toHaveLength(1);
		const { sendDate, ...values } = pipeline[0].$set;
		expect(sendDate).toEqual({ $toLong: '$$NOW' });
		expect(values).toEqual(
			Object.fromEntries(
				Object.entries({ ...message, schemaVersion: INTERNAL_CONFIG.CHAT_MESSAGE_SCHEMA_VERSION }).map(
					([field, value]) => [field, { $literal: value }]
				)
			)
		);
	});

	it('takes a message that is already stored as stored', async () => {
		failingWith(Object.assign(new Error('E11000 duplicate key'), { code: 11000 }));

		await expect(repository.save(message)).resolves.toBeUndefined();
	});

	it('fails on any other error, so the message stays unconfirmed', async () => {
		failingWith(new Error('connection lost'));

		await expect(repository.save(message)).rejects.toThrow('connection lost');
	});
});
