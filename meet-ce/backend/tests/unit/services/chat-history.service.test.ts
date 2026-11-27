import { describe, expect, it, jest } from '@jest/globals';
import { ParticipantInfo_Kind } from '@livekit/protocol';
import type { MeetChatMessage } from '@openvidu-meet/typings';
import type { ParticipantInfo, Room } from 'livekit-server-sdk';
import { ChatHistoryService } from '../../../src/services/chat-history.service.js';
import type { ChatMessageRepository } from '../../../src/repositories/chat-message.repository.js';
import type { OpenViduMeetError } from '../../../src/models/error.model.js';
import { LiveKitService } from '../../../src/services/livekit.service.js';
import type { LoggerService } from '../../../src/services/logger.service.js';
import { MeetingService } from '../../../src/services/meeting.service.js';

const ROOM_ID = 'room-1';
const IDENTITY = 'alice';
const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, verbose: () => {} };
const refused = () => Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
const standardParticipant = { identity: IDENTITY, kind: ParticipantInfo_Kind.STANDARD } as ParticipantInfo;
const savingMetadata = JSON.stringify({
	createdBy: 'openvidu-meet',
	roomOptions: { config: { chat: { enabled: true, persist: true }, e2ee: { enabled: false } } }
});
const message = { messageId: 'm-1', text: 'hello' } as MeetChatMessage;

/** The service over a real LiveKitService whose client answers with what the test gives it. */
const buildService = (lk: {
	room: { getParticipant: () => Promise<ParticipantInfo>; listRooms: () => Promise<Partial<Room>[]> };
}) => {
	const livekitService = new LiveKitService(logger as unknown as LoggerService);
	(livekitService as unknown as { lk: unknown }).lk = lk;
	const meetingService = new MeetingService(
		logger as unknown as LoggerService,
		livekitService,
		...(Array(9).fill({}) as [never, never, never, never, never, never, never, never, never])
	);
	const findByMeeting = jest.fn(async (_roomId: string, _meetingId: string, _page: object) => ({
		items: [message],
		isTruncated: false
	}));
	const service = new ChatHistoryService(meetingService, livekitService, {
		findByMeeting
	} as unknown as ChatMessageRepository);

	return { service, findByMeeting };
};

const outcome = (call: Promise<unknown>) =>
	call.then(
		() => 'served',
		(error: OpenViduMeetError) => `${error.statusCode} ${error.message}`
	);

describe('ChatHistoryService.listMessages', () => {
	const page = { maxItems: 20 };

	it('answers 503 when the media server refuses the connection while looking for the participant', async () => {
		const { service, findByMeeting } = buildService({
			room: {
				getParticipant: async () => {
					throw refused();
				},
				listRooms: async () => []
			}
		});

		expect(await outcome(service.listMessages(ROOM_ID, IDENTITY, page))).toBe('503 LiveKit is not available');
		expect(findByMeeting).not.toHaveBeenCalled();
	});

	it('answers 503 when the media server refuses the connection while reading the meeting room', async () => {
		const { service, findByMeeting } = buildService({
			room: {
				getParticipant: async () => standardParticipant,
				listRooms: async () => {
					throw refused();
				}
			}
		});

		expect(await outcome(service.listMessages(ROOM_ID, IDENTITY, page))).toBe('503 LiveKit is not available');
		expect(findByMeeting).not.toHaveBeenCalled();
	});

	it('answers 403 when the participant is in no meeting', async () => {
		const { service } = buildService({
			room: {
				getParticipant: async () => {
					throw Object.assign(new Error('not found'), { status: 404, code: 'not_found' });
				},
				listRooms: async () => []
			}
		});

		expect(await outcome(service.listMessages(ROOM_ID, IDENTITY, page))).toBe(
			"403 Participant 'alice' is not in the meeting of room 'room-1'"
		);
	});

	it('answers 403 when the meeting ended after the participant was found in it', async () => {
		const { service } = buildService({
			room: { getParticipant: async () => standardParticipant, listRooms: async () => [] }
		});

		expect(await outcome(service.listMessages(ROOM_ID, IDENTITY, page))).toBe(
			"403 Participant 'alice' is not in the meeting of room 'room-1'"
		);
	});

	it('reads the messages of the meeting the media server reports, by its sid', async () => {
		const { service, findByMeeting } = buildService({
			room: {
				getParticipant: async () => standardParticipant,
				listRooms: async () => [{ sid: 'RM_1', metadata: savingMetadata }]
			}
		});

		const result = await service.listMessages(ROOM_ID, IDENTITY, { maxItems: 5, nextPageToken: 'token' });

		expect(result.items).toEqual([message]);
		expect(findByMeeting).toHaveBeenCalledWith(ROOM_ID, 'RM_1', { maxItems: 5, nextPageToken: 'token' });
	});

	it('answers an empty page, without reading the messages, for a meeting that does not save its chat', async () => {
		const notSaving = JSON.stringify({
			createdBy: 'openvidu-meet',
			roomOptions: { config: { chat: { enabled: true, persist: false }, e2ee: { enabled: false } } }
		});
		const { service, findByMeeting } = buildService({
			room: {
				getParticipant: async () => standardParticipant,
				listRooms: async () => [{ sid: 'RM_1', metadata: notSaving }]
			}
		});

		expect(await service.listMessages(ROOM_ID, IDENTITY, page)).toEqual({ items: [], isTruncated: false });
		expect(findByMeeting).not.toHaveBeenCalled();
	});
});
