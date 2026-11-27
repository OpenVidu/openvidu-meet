import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Room as RtcRoom } from '@livekit/rtc-node';
import type { MeetRoomMemberPermissions } from '@openvidu-meet/typings';
import {
	MEET_CHAT_SAVER_IDENTITY,
	MEET_PERMISSION_KEYS,
	MeetChatStreamAttribute,
	MeetParticipantType,
	MeetRoomMemberUIBadge,
	MeetSignalType,
	MeetWebhookEventType
} from '@openvidu-meet/typings';
import { Express } from 'express';
import { jwtDecode } from 'jwt-decode';
import type { ClaimGrants } from 'livekit-server-sdk';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import ms from 'ms';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { container } from '../../../../src/config/dependency-injector.config.js';
import { INTERNAL_CONFIG, setInternalConfig } from '../../../../src/config/internal-config.js';
import { MEET_ENV } from '../../../../src/environment.js';
import { MeetRoomHelper } from '../../../../src/helpers/room.helper.js';
import { errorBroadcastRoomHasNoParticipants, errorRoomHasNoParticipants } from '../../../../src/models/error.model.js';
import { MeetChatMessageModel } from '../../../../src/models/mongoose-schemas/chat-message.schema.js';
import { ChatMessageRepository } from '../../../../src/repositories/chat-message.repository.js';
import { ChatSaverService } from '../../../../src/services/chat-saver.service.js';
import { FrontendEventService } from '../../../../src/services/frontend-event.service.js';
import { LiveKitService } from '../../../../src/services/livekit.service.js';
import { LoggerService } from '../../../../src/services/logger.service.js';
import { expectMeetError } from '../../../helpers/assertion-helpers.js';
import { disconnectFakeParticipants } from '../../../helpers/livekit-cli-helpers.js';
import {
	createWebhook,
	deleteAllRooms,
	deleteAllWebhooks,
	generateRoomMemberToken,
	getFullPath,
	getMeeting,
	listChatMessages,
	startBroadcasts,
	startRecording,
	startTestServer
} from '../../../helpers/request-helpers.js';
import { setupSingleRoom, startWebhookServer, stopWebhookServer } from '../../../helpers/test-scenarios.js';
import {
	pollUntil,
	ReceivedWebhook,
	waitForMeetingToEnd,
	waitForMeetingToStart,
	waitForWebhookCount,
	waitForWebhookEvent
} from '../../../helpers/wait-helpers.js';
import type { RoomData } from '../../../interfaces/scenarios.js';

const MEETING_START = 1_700_000_000_000;
const RESEND_INTERVAL_MS = 500;
const RESEND_DEADLINE_MS = 20_000;
const LIVEKIT_ROOM_PREFIX = 'chat-saver-';

const permissions = Object.fromEntries(
	MEET_PERMISSION_KEYS.map((key) => [key, true])
) as unknown as MeetRoomMemberPermissions;

/** A participant of the meeting that sends chat as the browser does and hears the server confirm each message. */
class ChatClient {
	readonly confirmed: string[] = [];

	private constructor(
		readonly identity: string,
		private readonly room: RtcRoom
	) {
		room.on('dataReceived', (payload, _participant, _kind, topic) => {
			if (topic === MeetSignalType.MEET_CHAT_MESSAGE_SAVED) {
				this.confirmed.push((JSON.parse(new TextDecoder().decode(payload)) as { messageId: string }).messageId);
			}
		});
	}

	static async connect(jwt: string): Promise<ChatClient> {
		const room = new RtcRoom();
		await room.connect(MEET_ENV.LIVEKIT_URL_PRIVATE, jwt, { autoSubscribe: false, dynacast: false });
		return new ChatClient(jwtDecode<ClaimGrants>(jwt).sub!, room);
	}

	/** Sends a text the way the chat does: to the saver only, unless told otherwise. */
	async send(
		text: string,
		{
			messageId = randomUUID() as string,
			attributes = {} as Record<string, string>,
			to = [MEET_CHAT_SAVER_IDENTITY]
		} = {}
	): Promise<string> {
		await this.room.localParticipant!.sendText(text, {
			topic: 'chat',
			destinationIdentities: to,
			attributes: { [MeetChatStreamAttribute.MESSAGE_ID]: messageId, ...attributes }
		});
		return messageId;
	}

	async waitUntilConfirmed(messageId: string): Promise<void> {
		await pollUntil(async () => this.confirmed.includes(messageId), {
			errorMessage: `Message '${messageId}' was not confirmed`
		});
	}

	/**
	 * Sends the message again, as the chat does while the server has not confirmed it. The saver learns of a
	 * participant a moment after they join, and drops what it cannot attribute yet, so the first message of a
	 * test is stored by a resend.
	 */
	async sendUntilConfirmed(text: string, { messageId = randomUUID() as string, ...options } = {}): Promise<string> {
		const deadline = Date.now() + RESEND_DEADLINE_MS;

		while (!this.confirmed.includes(messageId)) {
			if (Date.now() > deadline) throw new Error(`Message '${messageId}' was not confirmed`);

			await this.send(text, { messageId, ...options });
			await new Promise((resolve) => setTimeout(resolve, RESEND_INTERVAL_MS));
		}

		return messageId;
	}

	disconnect(): Promise<void> {
		return this.room.disconnect();
	}
}

const withoutBearer = (token: string) => token.replace(/^Bearer\s+/i, '');

describe('Chat saver Tests', () => {
	let app: Express;
	let livekitService: LiveKitService;
	let chatMessageRepository: ChatMessageRepository;
	const clients: ChatClient[] = [];
	const replicas: { saver: ChatSaverService; roomIds: Set<string> }[] = [];

	const stored = (roomId: string) => MeetChatMessageModel.find({ roomId }).sort({ sendDate: 1, _id: 1 }).lean();
	const saverOf = (roomId: string) => livekitService.findParticipant(roomId, MEET_CHAT_SAVER_IDENTITY);

	const connectClient = async (jwt: string) => {
		const client = await ChatClient.connect(jwt);
		clients.push(client);
		return client;
	};

	const waitForSaver = (roomId: string, differentFrom?: string) =>
		pollUntil(
			async () => {
				const saver = await saverOf(roomId);
				return !!saver && saver.sid !== differentFrom;
			},
			{ errorMessage: `The chat saver did not join room '${roomId}'` }
		);

	const defaultConfig = {
		MEETING_DEPARTURE_TIMEOUT: INTERNAL_CONFIG.MEETING_DEPARTURE_TIMEOUT,
		CHAT_SAVER_ROOM_CLOSE_WAIT: INTERNAL_CONFIG.CHAT_SAVER_ROOM_CLOSE_WAIT,
		CHAT_SAVER_ROOM_CLOSE_POLL_INTERVAL: INTERNAL_CONFIG.CHAT_SAVER_ROOM_CLOSE_POLL_INTERVAL
	};

	const waitForNoSaver = (roomId: string) =>
		pollUntil(async () => !(await saverOf(roomId)), { errorMessage: 'The chat saver did not leave' });

	beforeAll(async () => {
		app = await startTestServer();
		livekitService = container.get(LiveKitService);
		chatMessageRepository = container.get(ChatMessageRepository);
	});

	afterEach(async () => {
		await Promise.all(clients.splice(0).map((client) => client.disconnect().catch(() => {})));
		await Promise.all(
			replicas.splice(0).flatMap(({ saver, roomIds }) => [...roomIds].map((roomId) => saver.leave(roomId)))
		);
		await disconnectFakeParticipants();
		await deleteAllRooms();
		await MeetChatMessageModel.deleteMany({ roomId: /^TEST_ROOM|^chat-/ });

		for (const room of await livekitService.listRooms()) {
			if (room.name.startsWith(LIVEKIT_ROOM_PREFIX)) await livekitService.deleteRoom(room.name);
		}
	});

	afterAll(async () => {
		await disconnectFakeParticipants();
		await deleteAllRooms();
	});

	/**
	 * A meeting of a Meet room, joined through a join token, whose webhooks reach the deployment of the stack:
	 * that deployment, not this process, is the replica that joins its saver.
	 */
	describe('in a meeting of a Meet room', () => {
		let receivedWebhooks: ReceivedWebhook[] = [];

		const webhooksOf = (roomId: string, event: MeetWebhookEventType) =>
			receivedWebhooks.filter(
				({ body }) => body.event === event && (body.data as { roomId?: string }).roomId === roomId
			);

		const savingRoom = (config = {}) =>
			setupSingleRoom(false, 'TEST_ROOM', { chat: { enabled: true, persist: true }, ...config });

		const joinMeeting = async (room: RoomData, participantName: string) => {
			const token = await generateRoomMemberToken(room.room.roomId, {
				secret: room.speakerSecret,
				joinMeeting: true,
				participantName
			});
			return { token, client: await connectClient(withoutBearer(token)) };
		};

		const participantsOf = async (room: RoomData) =>
			(
				await request(app)
					.get(getFullPath(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/meetings/${room.room.roomId}/participants`))
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, room.moderatorToken)
			).body.participants as { participantIdentity: string }[];

		beforeAll(async () => {
			const webhookUrl = await startWebhookServer((req) => {
				receivedWebhooks.push({ headers: req.headers, body: req.body, rawBody: req.rawBody });
			});
			await deleteAllWebhooks();
			await createWebhook({ url: webhookUrl });
		});

		afterAll(async () => {
			await deleteAllWebhooks();
			await stopWebhookServer();
		});

		beforeEach(() => {
			receivedWebhooks = [];
		});

		afterEach(() => {
			setInternalConfig(defaultConfig);
		});

		it('stores a message with the sender LiveKit reports, confirms it and serves it in the history', async () => {
			const room = await savingRoom();
			const { roomId } = room.room;
			const { token, client } = await joinMeeting(room, 'Sender');
			await waitForSaver(roomId);

			const messageId = await client.sendUntilConfirmed('hello');

			const [message] = await stored(roomId);
			expect(message).toMatchObject({
				roomId,
				meetingId: (await livekitService.getRoom(roomId)).sid,
				messageId,
				channel: 'all',
				text: 'hello',
				participant: { identity: client.identity, name: 'Sender', type: MeetParticipantType.ANONYMOUS }
			});
			expect(message.sendDate).toBeGreaterThan(Date.now() - 60_000);
			const history = await listChatMessages(roomId, token);
			expect(history.body.items).toMatchObject([{ messageId, text: 'hello' }]);
		});

		it('joins no saver to a room that does not save its chat', async () => {
			const room = await savingRoom({ chat: { enabled: true, persist: false } });
			const { roomId } = room.room;
			const { client } = await joinMeeting(room, 'Sender');
			await waitForWebhookEvent(receivedWebhooks, MeetWebhookEventType.PARTICIPANT_JOINED, { roomId });
			await waitForMeetingToStart(roomId);
			const savingMeanwhile = await savingRoom();
			const { client: savedSender } = await joinMeeting(savingMeanwhile, 'Saved sender');
			await waitForSaver(savingMeanwhile.room.roomId);
			await savedSender.sendUntilConfirmed('stored');

			await client.send('hello');

			expect(await saverOf(roomId)).toBeUndefined();
			expect(await stored(roomId)).toEqual([]);
		});

		describe('Saving is invisible in the meeting', () => {
			it('is not listed, counted, announced or kept going once everyone left', async () => {
				const room = await savingRoom({ maxParticipants: 2 });
				const { roomId } = room.room;
				const { client: ana } = await joinMeeting(room, 'Ana');
				await waitForSaver(roomId);

				// The saver holds no place: a second participant is admitted to a room limited to two
				const { client: bob } = await joinMeeting(room, 'Bob');
				await waitForWebhookCount(
					receivedWebhooks,
					({ body }) => body.event === MeetWebhookEventType.PARTICIPANT_JOINED,
					2
				);

				const { body: meeting } = await getMeeting(roomId, room.moderatorToken);
				expect(meeting.participantCount).toBe(2);
				expect((await participantsOf(room)).map((p) => p.participantIdentity).sort()).toEqual(
					[ana.identity, bob.identity].sort()
				);

				// Its own departure and return reach no webhook, and the LiveKit room keeps what Meet gave it
				const firstSaver = (await saverOf(roomId))!;
				await livekitService.deleteParticipant(roomId, MEET_CHAT_SAVER_IDENTITY);
				await waitForSaver(roomId, firstSaver.sid);
				const livekitRoom = await livekitService.getRoom(roomId);
				expect(MeetRoomHelper.checkIfMeetingBelogsToOpenViduMeet(livekitRoom.metadata)).toBe(true);
				expect(MeetRoomHelper.extractRoomOptionsFromMetadata(livekitRoom.metadata)?.config?.chat?.persist).toBe(
					true
				);
				expect(livekitRoom.maxParticipants).toBe(2);
				expect(livekitRoom.emptyTimeout).toBe(ms(INTERNAL_CONFIG.MEETING_EMPTY_TIMEOUT) / 1000);
				expect(livekitRoom.departureTimeout).toBe(ms(INTERNAL_CONFIG.MEETING_DEPARTURE_TIMEOUT) / 1000);

				// The meeting ends when the last participant leaves, as in a room that does not save
				await Promise.all([ana.disconnect(), bob.disconnect()]);
				await waitForMeetingToEnd(roomId);
				await waitForWebhookEvent(receivedWebhooks, MeetWebhookEventType.MEETING_ENDED, { roomId });
				await waitForWebhookCount(
					receivedWebhooks,
					({ body }) => body.event === MeetWebhookEventType.PARTICIPANT_LEFT,
					2
				);

				expect(webhooksOf(roomId, MeetWebhookEventType.MEETING_STARTED)).toHaveLength(1);
				expect(webhooksOf(roomId, MeetWebhookEventType.MEETING_ENDED)).toHaveLength(1);
				const identities = (event: MeetWebhookEventType) =>
					webhooksOf(roomId, event).map(
						({ body }) =>
							(body.data as { participant: { participantIdentity: string } }).participant
								.participantIdentity
					);
				expect(identities(MeetWebhookEventType.PARTICIPANT_JOINED).sort()).toEqual(
					[ana.identity, bob.identity].sort()
				);
				expect(identities(MeetWebhookEventType.PARTICIPANT_LEFT).sort()).toEqual(
					[ana.identity, bob.identity].sort()
				);
			});

			it('does not count as someone connected when a recording or a broadcast starts', async () => {
				setInternalConfig({ MEETING_DEPARTURE_TIMEOUT: '1m' });
				const room = await savingRoom({
					broadcast: {
						enabled: true,
						destinations: [{ name: 'Sink', url: 'rtmp://rtmp-sink.invalid/live/key' }]
					}
				});
				const { roomId } = room.room;
				const { client } = await joinMeeting(room, 'Ana');
				await waitForSaver(roomId);
				await client.disconnect();
				await pollUntil(async () => !(await livekitService.roomHasParticipants(roomId)), {
					errorMessage: 'The participant did not leave'
				});

				expect(await saverOf(roomId)).toBeDefined();
				expectMeetError(await startRecording(roomId), errorRoomHasNoParticipants(roomId));
				expectMeetError(await startBroadcasts(roomId), errorBroadcastRoomHasNoParticipants(roomId));
			});
		});

		describe('the LiveKit room a chat saver created', () => {
			const savedRoomMetadata = MeetRoomHelper.CHAT_SAVER_ROOM_METADATA;

			const livekitRoomOfSaver = async (roomId: string, emptyTimeout: number) => {
				const admin = new RoomServiceClient(
					MEET_ENV.LIVEKIT_URL_PRIVATE.replace(/^ws/, 'http'),
					MEET_ENV.LIVEKIT_API_KEY,
					MEET_ENV.LIVEKIT_API_SECRET
				);
				await admin.createRoom({ name: roomId, metadata: savedRoomMetadata, emptyTimeout });
			};

			it('is no meeting: no meetingStarted or meetingEnded, and a join token request gets a room with the metadata of Meet', async () => {
				setInternalConfig({ CHAT_SAVER_ROOM_CLOSE_WAIT: '1s', CHAT_SAVER_ROOM_CLOSE_POLL_INTERVAL: '100ms' });
				const room = await savingRoom();
				const { roomId } = room.room;
				// LiveKit keeps this room, as it keeps the one a saver's join creates for a second
				await livekitRoomOfSaver(roomId, 60);
				expect(MeetRoomHelper.isChatSaverRoomMetadata((await livekitService.getRoom(roomId)).metadata)).toBe(
					true
				);

				const { client } = await joinMeeting(room, 'Ana');

				const livekitRoom = await livekitService.getRoom(roomId);
				expect(MeetRoomHelper.checkIfMeetingBelogsToOpenViduMeet(livekitRoom.metadata)).toBe(true);
				await waitForWebhookEvent(receivedWebhooks, MeetWebhookEventType.MEETING_STARTED, { roomId });
				await waitForSaver(roomId);
				await client.disconnect();
				await waitForMeetingToEnd(roomId);
				await waitForWebhookEvent(receivedWebhooks, MeetWebhookEventType.MEETING_ENDED, { roomId });

				expect(webhooksOf(roomId, MeetWebhookEventType.MEETING_STARTED)).toHaveLength(1);
				expect(webhooksOf(roomId, MeetWebhookEventType.MEETING_ENDED)).toHaveLength(1);
			});

			it('is waited for while LiveKit closes it by itself', async () => {
				const room = await savingRoom();
				const { roomId } = room.room;
				await livekitRoomOfSaver(roomId, 1);

				await joinMeeting(room, 'Ana');

				expect(
					MeetRoomHelper.checkIfMeetingBelogsToOpenViduMeet((await livekitService.getRoom(roomId)).metadata)
				).toBe(true);
				await waitForWebhookEvent(receivedWebhooks, MeetWebhookEventType.MEETING_STARTED, { roomId });
				expect(webhooksOf(roomId, MeetWebhookEventType.MEETING_ENDED)).toHaveLength(0);
			});
		});
	});

	/**
	 * Meetings made straight in LiveKit, under names of no Meet room: the deployment of the stack ignores their
	 * webhooks, so the replicas below, which this process plays, are the only ones that act on them.
	 */
	describe('in a meeting the test runs the replicas of', () => {
		const newReplica = (save?: ChatMessageRepository['save']) => {
			const repository = save ? { save } : chatMessageRepository;
			const saver = new ChatSaverService(
				container.get(LoggerService),
				livekitService,
				container.get(FrontendEventService),
				repository as ChatMessageRepository
			);
			const replica = { saver, roomIds: new Set<string>() };
			replicas.push(replica);
			return {
				ensureSaver: async (roomId: string) => {
					replica.roomIds.add(roomId);
					await saver.ensureSaver(roomId);
				},
				saver
			};
		};

		const holds = (replica: ChatSaverService, roomId: string) =>
			(replica as unknown as { connections: Map<string, unknown> }).connections.has(roomId);

		const startMeeting = async (chat = { enabled: true, persist: true }) => {
			const roomId = `${LIVEKIT_ROOM_PREFIX}${randomUUID().slice(0, 8)}`;
			const metadata = JSON.stringify({
				createdBy: MEET_ENV.NAME_ID,
				startDate: MEETING_START,
				roomOptions: { config: { chat, e2ee: { enabled: false } } }
			});
			await livekitService.createRoom({ name: roomId, metadata, emptyTimeout: 300, departureTimeout: 300 });
			return roomId;
		};

		const joinAs = async (roomId: string, identity: string, name = identity, memberFields = {}) => {
			const token = new AccessToken(MEET_ENV.LIVEKIT_API_KEY, MEET_ENV.LIVEKIT_API_SECRET, {
				identity,
				name,
				metadata: JSON.stringify({
					iat: Date.now(),
					roomId,
					permissions,
					badge: MeetRoomMemberUIBadge.OTHER,
					...memberFields
				})
			});
			token.addGrant({
				roomJoin: true,
				room: roomId,
				canPublish: false,
				canPublishData: true,
				canSubscribe: true
			});
			return connectClient(await token.toJwt());
		};

		const sendAndWait = (client: ChatClient, text: string, options = {}) =>
			client.sendUntilConfirmed(text, options);

		it('stores a text and a sender name starting with $ as sent, and a resend once, with the send date it first had', async () => {
			const roomId = await startMeeting();
			await newReplica().ensureSaver(roomId);
			const sender = await joinAs(roomId, 'ana', '$$ROOT');

			const messageId = await sendAndWait(sender, '$5 off');
			const [first] = await stored(roomId);
			await sendAndWait(sender, '$5 off', { messageId });

			const messages = await stored(roomId);
			expect(messages).toHaveLength(1);
			expect(messages[0]).toMatchObject({
				text: '$5 off',
				participant: { identity: 'ana', name: '$$ROOT' },
				meetingId: (await livekitService.getRoom(roomId)).sid,
				meetingStartDate: MEETING_START
			});
			expect(messages[0].sendDate).toBe(first.sendDate);
		});

		it('stores the same message id of two senders apart, each under its own sender', async () => {
			const roomId = await startMeeting();
			await newReplica().ensureSaver(roomId);
			const ana = await joinAs(roomId, 'ana', 'Ana', { userId: 'ana-id' });
			const bob = await joinAs(roomId, 'bob', 'Bob', { memberId: 'bob-id' });
			const messageId = randomUUID();

			await sendAndWait(ana, 'from ana', { messageId });
			await sendAndWait(bob, 'from bob', { messageId });

			expect((await stored(roomId)).map(({ participant }) => participant)).toEqual([
				{ identity: 'ana', name: 'Ana', type: MeetParticipantType.USER },
				{ identity: 'bob', name: 'Bob', type: MeetParticipantType.IDENTIFIED_GUEST }
			]);
		});

		it('stores a message under the sender LiveKit reports, whoever the client claims to be', async () => {
			const roomId = await startMeeting();
			await newReplica().ensureSaver(roomId);
			await joinAs(roomId, 'alice', 'Alice');
			const mallory = await joinAs(roomId, 'mallory', 'Mallory');

			await sendAndWait(mallory, 'I am alice', {
				attributes: { sender: 'alice', identity: 'alice', 'lk.sender_identity': 'alice' }
			});

			expect((await stored(roomId)).map(({ participant }) => participant.identity)).toEqual(['mallory']);
		});

		it('confirms a message over 500 characters and a blank one without storing them, and stores the next', async () => {
			const roomId = await startMeeting();
			await newReplica().ensureSaver(roomId);
			const sender = await joinAs(roomId, 'ana');

			await sendAndWait(sender, 'x'.repeat(501));
			await sendAndWait(sender, '\n');
			await sendAndWait(sender, 'hello');

			expect((await stored(roomId)).map(({ text }) => text)).toEqual(['hello']);
		});

		it('ends a stream over 2,000 bytes with an error: it is neither stored nor confirmed', async () => {
			const roomId = await startMeeting();
			await newReplica().ensureSaver(roomId);
			const sender = await joinAs(roomId, 'ana');

			await sendAndWait(sender, 'first');

			const oversized = await sender.send('x'.repeat(2_500));
			await sendAndWait(sender, 'last');

			expect((await stored(roomId)).map(({ text }) => text)).toEqual(['first', 'last']);
			expect(sender.confirmed).not.toContain(oversized);
		});

		it('drops a message without a message id and one whose id is not a UUID, unconfirmed', async () => {
			const roomId = await startMeeting();
			await newReplica().ensureSaver(roomId);
			const sender = await joinAs(roomId, 'ana');

			await sendAndWait(sender, 'first');

			await sender.send('not a uuid', { messageId: 'message-1' });
			await sendAndWait(sender, 'last');

			expect((await stored(roomId)).map(({ text }) => text)).toEqual(['first', 'last']);
			expect(sender.confirmed).not.toContain('message-1');
		});

		it('stores the message a failed write left unconfirmed once its sender sends it again', async () => {
			const roomId = await startMeeting();
			let storageDown = true;
			const attempts: string[] = [];
			const replica = newReplica(async (message) => {
				attempts.push(message.messageId);

				if (storageDown) throw new Error('MongoDB is down');

				await chatMessageRepository.save(message);
			});
			await replica.ensureSaver(roomId);
			const sender = await joinAs(roomId, 'ana');

			const messageId = randomUUID();
			await pollUntil(
				async () => {
					await sender.send('still here', { messageId });
					await new Promise((resolve) => setTimeout(resolve, RESEND_INTERVAL_MS));
					return attempts.includes(messageId);
				},
				{ errorMessage: 'The saver did not try to store it' }
			);
			expect(sender.confirmed).toEqual([]);

			storageDown = false;
			await sendAndWait(sender, 'still here', { messageId });

			expect((await stored(roomId)).map(({ text }) => text)).toEqual(['still here']);
		});

		it('does not join a meeting whose metadata says it does not save its chat', async () => {
			const roomId = await startMeeting({ enabled: true, persist: false });
			const replica = newReplica();

			await replica.ensureSaver(roomId);

			expect(await saverOf(roomId)).toBeUndefined();
			expect(holds(replica.saver, roomId)).toBe(false);
		});

		it('leaves, storing nothing and deleting nothing, a room that is not a meeting of Meet', async () => {
			const roomId = `${LIVEKIT_ROOM_PREFIX}${randomUUID().slice(0, 8)}`;
			await livekitService.createRoom({
				name: roomId,
				metadata: MeetRoomHelper.CHAT_SAVER_ROOM_METADATA,
				emptyTimeout: 300
			});
			const replica = newReplica();

			await (replica.saver as unknown as { join: (roomId: string) => Promise<void> }).join(roomId);

			expect(holds(replica.saver, roomId)).toBe(false);
			await waitForNoSaver(roomId);
			expect((await livekitService.getRoom(roomId)).metadata).toBe(MeetRoomHelper.CHAT_SAVER_ROOM_METADATA);
		});

		it('releases the connection of a meeting LiveKit closed, which the binding would keep listening', async () => {
			const roomId = await startMeeting();
			const replica = newReplica();
			await replica.ensureSaver(roomId);
			const { room } = (
				replica.saver as unknown as { connections: Map<string, { room: { onFfiEvent: () => void } }> }
			).connections.get(roomId)!;
			const isListening = () =>
				(
					globalThis as unknown as { _ffiClientInstance: { listeners(event: string): unknown[] } }
				)._ffiClientInstance
					.listeners('ffi_event')
					.includes(room.onFfiEvent);
			expect(isListening()).toBe(true);

			await livekitService.deleteRoom(roomId);

			await pollUntil(async () => !holds(replica.saver, roomId), {
				errorMessage: 'The chat saver kept the connection of a closed room'
			});
			expect(isListening()).toBe(false);
		});

		describe('Saving with several replicas', () => {
			it('stores a message once when the events of the meeting reach both replicas', async () => {
				const roomId = await startMeeting();
				const a = newReplica();
				const b = newReplica();
				await a.ensureSaver(roomId);
				await b.ensureSaver(roomId);
				const sender = await joinAs(roomId, 'ana');

				await sendAndWait(sender, 'hello');

				expect(holds(a.saver, roomId)).toBe(true);
				expect(holds(b.saver, roomId)).toBe(false);
				expect((await stored(roomId)).map(({ text }) => text)).toEqual(['hello']);
			});

			it('is taken over by another replica when the one saving stops, which stores what its sender sends again', async () => {
				const roomId = await startMeeting();
				const a = newReplica();
				const b = newReplica();
				await a.ensureSaver(roomId);
				const sender = await joinAs(roomId, 'ana');

				// A stops handling the meeting; LiveKit then tells of the departure of its saver, which it does
				// after 21 seconds for a process that died
				(a.saver as unknown as { connections: Map<string, unknown> }).connections.clear();
				await livekitService.deleteParticipant(roomId, MEET_CHAT_SAVER_IDENTITY);
				const messageId = await sender.send('are you there');
				await b.ensureSaver(roomId);
				await sendAndWait(sender, 'are you there', { messageId });

				expect((await stored(roomId)).map(({ text }) => text)).toEqual(['are you there']);
			});

			it('orders messages by the time of the database, whichever clock the replica that stored them has', async () => {
				const roomId = await startMeeting();
				const a = newReplica();
				const b = newReplica();
				await a.ensureSaver(roomId);
				const sender = await joinAs(roomId, 'ana');
				await sendAndWait(sender, 'one');

				await a.saver.leave(roomId);
				await waitForNoSaver(roomId);
				const now = Date.now();
				const clock = jest.spyOn(Date, 'now').mockImplementation(() => now - 60_000);
				try {
					await b.ensureSaver(roomId);
					await sendAndWait(sender, 'two');
				} finally {
					clock.mockRestore();
				}

				expect((await stored(roomId)).map(({ text }) => text)).toEqual(['one', 'two']);
			});

			it('rejoins after a restart that left the saver of the dead process listed, and stores what its sender sends again', async () => {
				const roomId = await startMeeting();
				const before = newReplica();
				await before.ensureSaver(roomId);
				const sender = await joinAs(roomId, 'ana');
				// The process dies: its connection is gone without leaving, the media server still lists the saver
				(before.saver as unknown as { connections: Map<string, unknown> }).connections.clear();
				const restarted = newReplica();

				await restarted.ensureSaver(roomId);
				expect(holds(restarted.saver, roomId)).toBe(false);

				const messageId = await sender.send('back');
				await livekitService.deleteParticipant(roomId, MEET_CHAT_SAVER_IDENTITY);
				await restarted.ensureSaver(roomId);
				await sendAndWait(sender, 'back', { messageId });

				expect((await stored(roomId)).map(({ text }) => text)).toEqual(['back']);
			});
		});
	});
});
