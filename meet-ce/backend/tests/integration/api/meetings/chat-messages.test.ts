import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { MeetParticipantType, MeetRoomDeletionPolicyWithMeeting, MeetUserRole } from '@openvidu-meet/typings';
import { jwtDecode } from 'jwt-decode';
import type { ClaimGrants } from 'livekit-server-sdk';
import { randomUUID } from 'node:crypto';
import { container } from '../../../../src/config/dependency-injector.config.js';
import {
	errorInsufficientPermissions,
	errorInvalidToken,
	errorUnauthorized
} from '../../../../src/models/error.model.js';
import { MeetChatMessageModel } from '../../../../src/models/mongoose-schemas/chat-message.schema.js';
import type { ChatMessageToSave } from '../../../../src/repositories/chat-message.repository.js';
import { ChatMessageRepository } from '../../../../src/repositories/chat-message.repository.js';
import { LiveKitService } from '../../../../src/services/livekit.service.js';
import { expectErrorResponse, expectMeetError } from '../../../helpers/assertion-helpers.js';
import { disconnectFakeParticipants, joinFakeParticipant } from '../../../helpers/livekit-cli-helpers.js';
import {
	bulkDeleteRooms,
	createUser,
	deleteAllRooms,
	deleteRoom,
	deleteUser,
	endMeeting,
	generateRoomMemberToken,
	kickParticipant,
	listChatMessages,
	startTestServer,
	updateRoomConfig,
	updateRoomRoles
} from '../../../helpers/request-helpers.js';
import { setupSingleRoom } from '../../../helpers/test-scenarios.js';
import { waitForMeetingToEnd, waitForMeetingToStart, waitForRoomToDelete } from '../../../helpers/wait-helpers.js';
import { RoomData } from '../../../interfaces/scenarios.js';

const savingChat = { chat: { enabled: true, persist: true } };
const alice = { identity: 'alice', name: 'Alice', type: MeetParticipantType.USER };

describe('Meetings API Tests', () => {
	let chatMessageRepository: ChatMessageRepository;
	let livekitService: LiveKitService;
	let roomData: RoomData;

	beforeAll(async () => {
		await startTestServer();
		chatMessageRepository = container.get(ChatMessageRepository);
		livekitService = container.get(LiveKitService);
	});

	afterAll(async () => {
		await disconnectFakeParticipants();
		await deleteAllRooms();
		await MeetChatMessageModel.deleteMany({ roomId: /^TEST_ROOM|^chat-/ });
	});

	const message = (roomId: string, meetingId: string, text: string, participant = alice): ChatMessageToSave => ({
		roomId,
		meetingId,
		messageId: randomUUID(),
		channel: 'all',
		meetingStartDate: Date.now(),
		text,
		participant
	});

	const saveMessages = async (roomId: string, meetingId: string, texts: string[]) => {
		for (const text of texts) {
			await chatMessageRepository.save(message(roomId, meetingId, text));
		}
	};

	const storedMessages = (roomId: string) => MeetChatMessageModel.countDocuments({ roomId });

	/** Joins the meeting of the room through a join token, so the token acts as that participant. */
	const joinMeeting = async (room: RoomData, participantName: string, secret = room.speakerSecret) => {
		const token = await generateRoomMemberToken(room.room.roomId, {
			secret,
			joinMeeting: true,
			participantName
		});
		const { sub, metadata } = jwtDecode<ClaimGrants>(token.replace(/^Bearer\s+/i, ''));
		await joinFakeParticipant(room.room.roomId, sub!, metadata);
		return { token, identity: sub! };
	};

	const meetingSid = async (roomId: string) => (await livekitService.getRoom(roomId)).sid;

	describe('Chat History Tests', () => {
		beforeEach(async () => {
			roomData = await setupSingleRoom(false, 'TEST_ROOM', savingChat);
		});

		describe('reading the history', () => {
			it('should serve the messages of the meeting in progress, newest first', async () => {
				const reader = await joinMeeting(roomData, 'Reader');
				const sid = await meetingSid(roomData.room.roomId);
				await saveMessages(roomData.room.roomId, sid, ['hello', 'hi alice']);

				const response = await listChatMessages(roomData.room.roomId, reader.token);

				expect(response.status).toBe(200);
				expect(response.body.items.map((item: { text: string }) => item.text)).toEqual(['hi alice', 'hello']);
				expect(response.body.items[0]).toMatchObject({
					roomId: roomData.room.roomId,
					meetingId: sid,
					channel: 'all',
					sendDate: expect.any(Number),
					participant: alice
				});
				expect(response.body.items[0]).not.toHaveProperty('schemaVersion');
				expect(response.body.pagination).toEqual({ isTruncated: false, maxItems: 20 });
			});

			it('should page the messages, newest first, across two pages', async () => {
				const reader = await joinMeeting(roomData, 'Reader');
				const sid = await meetingSid(roomData.room.roomId);
				await saveMessages(roomData.room.roomId, sid, ['m1', 'm2', 'm3', 'm4', 'm5']);
				const textsOf = (body: { items: { text: string }[] }) => body.items.map((item) => item.text);

				const first = await listChatMessages(roomData.room.roomId, reader.token, { maxItems: 2 });
				const second = await listChatMessages(roomData.room.roomId, reader.token, {
					maxItems: 2,
					nextPageToken: first.body.pagination.nextPageToken
				});
				const last = await listChatMessages(roomData.room.roomId, reader.token, {
					maxItems: 2,
					nextPageToken: second.body.pagination.nextPageToken
				});

				expect(textsOf(first.body)).toEqual(['m5', 'm4']);
				expect(first.body.pagination).toMatchObject({ isTruncated: true, maxItems: 2 });
				expect(textsOf(second.body)).toEqual(['m3', 'm2']);
				expect(second.body.pagination.isTruncated).toBe(true);
				expect(textsOf(last.body)).toEqual(['m1']);
				expect(last.body.pagination.isTruncated).toBe(false);
			});

			it('should cap the page size at 100 and say so', async () => {
				const reader = await joinMeeting(roomData, 'Reader');

				const response = await listChatMessages(roomData.room.roomId, reader.token, { maxItems: 500 });

				expect(response.status).toBe(200);
				expect(response.body.pagination.maxItems).toBe(100);
			});

			it('should not serve the messages of an earlier meeting', async () => {
				const reader = await joinMeeting(roomData, 'Reader');
				const sid = await meetingSid(roomData.room.roomId);
				await saveMessages(roomData.room.roomId, 'RM_earlier_meeting', ['from before']);
				await saveMessages(roomData.room.roomId, sid, ['hello']);

				const response = await listChatMessages(roomData.room.roomId, reader.token);

				expect(response.body.items.map((item: { text: string }) => item.text)).toEqual(['hello']);
				expect(await storedMessages(roomData.room.roomId)).toBe(2);
			});

			it('should answer an empty page, though messages are stored, in a room that does not save its chat', async () => {
				roomData = await setupSingleRoom(false, 'TEST_ROOM', { chat: { enabled: true, persist: false } });
				const reader = await joinMeeting(roomData, 'Reader');
				await saveMessages(roomData.room.roomId, await meetingSid(roomData.room.roomId), ['hello']);

				const response = await listChatMessages(roomData.room.roomId, reader.token);

				expect(response.status).toBe(200);
				expect(response.body).toEqual({ items: [], pagination: { isTruncated: false, maxItems: 20 } });
			});

			it('should answer 422 for a page size of zero', async () => {
				const reader = await joinMeeting(roomData, 'Reader');

				const response = await listChatMessages(roomData.room.roomId, reader.token, { maxItems: 0 });

				expectErrorResponse(response, 422, 'Unprocessable Entity', 'Invalid request', [
					{ field: 'maxItems', message: 'maxItems must be a positive number' }
				]);
			});

			it('should answer 400 for a page token the server did not issue', async () => {
				const reader = await joinMeeting(roomData, 'Reader');

				const response = await listChatMessages(roomData.room.roomId, reader.token, {
					nextPageToken: 'not-a-token'
				});

				expect(response.status).toBe(400);
				expect(response.body).toEqual({ error: 'Bad Request', message: 'Invalid pagination token' });
			});
		});

		describe('who may read it', () => {
			it('should answer 403 to a participant without chatRead', async () => {
				await updateRoomRoles(roomData.room.roomId, { speaker: { permissions: { chatRead: false } } });
				const reader = await joinMeeting(roomData, 'Reader');

				const response = await listChatMessages(roomData.room.roomId, reader.token);

				expectMeetError(response, errorInsufficientPermissions());
			});

			it('should answer 403 to a token of another room', async () => {
				const otherRoom = await setupSingleRoom(false, 'TEST_ROOM', savingChat);

				const response = await listChatMessages(roomData.room.roomId, otherRoom.speakerToken);

				expectMeetError(response, errorInsufficientPermissions());
			});

			it('should answer 403 to a token that does not join', async () => {
				await joinMeeting(roomData, 'Reader');

				const response = await listChatMessages(roomData.room.roomId, roomData.speakerToken);

				expectMeetError(response, errorInsufficientPermissions());
			});

			it('should answer 403 to a participant who left the meeting, holding the token they joined with', async () => {
				await joinMeeting(roomData, 'Reader');
				const leaver = await joinMeeting(roomData, 'Leaver');
				await livekitService.deleteParticipant(roomData.room.roomId, leaver.identity);

				const response = await listChatMessages(roomData.room.roomId, leaver.token);

				expect(response.status).toBe(403);
				expect(response.body.error).toBe('Chat Error');
			});

			it('should answer 403 when no meeting is in progress', async () => {
				const reader = await joinMeeting(roomData, 'Reader');
				await endMeeting(roomData.room.roomId, roomData.moderatorToken);
				await waitForMeetingToEnd(roomData.room.roomId);

				const response = await listChatMessages(roomData.room.roomId, reader.token);

				expect(response.status).toBe(403);
				expect(response.body.error).toBe('Chat Error');
			});

			it('should answer 401 to a participant who was kicked, holding the token they joined with', async () => {
				await joinMeeting(roomData, 'Reader');
				const kicked = await joinMeeting(roomData, 'Kicked');
				const kick = await kickParticipant(roomData.room.roomId, kicked.identity, roomData.moderatorToken);
				expect(kick.status).toBe(200);

				const response = await listChatMessages(roomData.room.roomId, kicked.token);

				expectMeetError(response, errorInvalidToken());
			});

			it('should answer 401 without a room member token', async () => {
				const response = await listChatMessages(roomData.room.roomId);

				expectMeetError(response, errorUnauthorized());
			});
		});
	});

	describe('Saved Chat Messages Tests', () => {
		beforeEach(async () => {
			roomData = await setupSingleRoom(false, 'TEST_ROOM', savingChat);
		});

		it('should store a message once, as sent, however many times it is saved', async () => {
			const original = message(roomData.room.roomId, 'RM_1', '$5 off $$ROOT', {
				identity: 'alice',
				name: '$name',
				type: MeetParticipantType.USER
			});

			await chatMessageRepository.save(original);
			const [stored] = await MeetChatMessageModel.find({ roomId: roomData.room.roomId }).lean();
			await chatMessageRepository.save({ ...original, text: 'changed' });

			const documents = await MeetChatMessageModel.find({ roomId: roomData.room.roomId }).lean();
			expect(documents).toHaveLength(1);
			expect(documents[0]).toMatchObject({
				...original,
				schemaVersion: 1,
				text: '$5 off $$ROOT',
				participant: { name: '$name' }
			});
			expect(Math.abs(stored.sendDate - Date.now())).toBeLessThan(60_000);
			expect(documents[0].sendDate).toBe(stored.sendDate);
		});

		it('should store the same message id of two senders apart', async () => {
			const original = message(roomData.room.roomId, 'RM_1', 'hello');

			await chatMessageRepository.save(original);
			await chatMessageRepository.save({ ...original, participant: { ...alice, identity: 'bob', name: 'Bob' } });

			expect(await storedMessages(roomData.room.roomId)).toBe(2);
		});

		describe('deletion', () => {
			it('should delete the messages of a room with it, and only those', async () => {
				const otherRoom = await setupSingleRoom(false, 'TEST_ROOM', savingChat);
				await saveMessages(roomData.room.roomId, 'RM_1', ['hello', 'bye']);
				await saveMessages(otherRoom.room.roomId, 'RM_1', ['hello']);

				const response = await deleteRoom(roomData.room.roomId);

				expect(response.status).toBe(200);
				expect(await storedMessages(roomData.room.roomId)).toBe(0);
				expect(await storedMessages(otherRoom.room.roomId)).toBe(1);
			});

			it('should delete the messages of every room of a bulk deletion', async () => {
				const otherRoom = await setupSingleRoom(false, 'TEST_ROOM', savingChat);
				await saveMessages(roomData.room.roomId, 'RM_1', ['hello']);
				await saveMessages(otherRoom.room.roomId, 'RM_1', ['hello']);

				const response = await bulkDeleteRooms([roomData.room.roomId, otherRoom.room.roomId]);

				expect(response.status).toBe(200);
				expect(await storedMessages(roomData.room.roomId)).toBe(0);
				expect(await storedMessages(otherRoom.room.roomId)).toBe(0);
			});

			it('should delete the messages of a room that waited for its meeting to end, once it ends', async () => {
				await joinMeeting(roomData, 'Reader');
				await waitForMeetingToStart(roomData.room.roomId);
				await saveMessages(roomData.room.roomId, await meetingSid(roomData.room.roomId), ['hello']);

				const response = await deleteRoom(roomData.room.roomId, {
					withMeeting: MeetRoomDeletionPolicyWithMeeting.WHEN_MEETING_ENDS
				});
				expect(response.status).toBe(202);
				expect(await storedMessages(roomData.room.roomId)).toBe(1);

				await endMeeting(roomData.room.roomId, roomData.moderatorToken);
				await waitForRoomToDelete(roomData.room.roomId);

				expect(await storedMessages(roomData.room.roomId)).toBe(0);
			});

			it('should keep the messages, as stored, when saving is turned off, encryption on and their sender deleted', async () => {
				const anaId = `ana_${Date.now()}`;
				const ana = await createUser({
					userId: anaId,
					name: 'Ana',
					role: MeetUserRole.ROOM_MEMBER,
					password: 'Pass_w0rd_ana'
				});
				expect(ana.status).toBe(201);
				const stored = message(roomData.room.roomId, 'RM_1', 'hello', {
					identity: anaId,
					name: 'Ana',
					type: MeetParticipantType.USER
				});
				await chatMessageRepository.save(stored);

				const update = await updateRoomConfig(roomData.room.roomId, {
					chat: { enabled: true, persist: false },
					e2ee: { enabled: true }
				});
				expect(update.status).toBe(200);
				expect((await deleteUser(anaId)).status).toBe(200);

				const documents = await MeetChatMessageModel.find({ roomId: roomData.room.roomId }).lean();
				expect(documents).toHaveLength(1);
				expect(documents[0]).toMatchObject(stored);
			});
		});
	});
});
