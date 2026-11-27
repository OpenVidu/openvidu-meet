import type { MeetChatMessage } from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import { MeetRoomHelper } from '../helpers/room.helper.js';
import type { PaginatedResult } from '../models/database.model.js';
import { errorChatReaderNotInMeeting } from '../models/error.model.js';
import { ChatMessageRepository } from '../repositories/chat-message.repository.js';
import { LiveKitService } from './livekit.service.js';
import { MeetingService } from './meeting.service.js';

/**
 * Serves the saved chat of the meeting in progress to the participants in it.
 */
@injectable()
export class ChatHistoryService {
	constructor(
		@inject(MeetingService) protected meetingService: MeetingService,
		@inject(LiveKitService) protected livekitService: LiveKitService,
		@inject(ChatMessageRepository) protected chatMessageRepository: ChatMessageRepository
	) {}

	/**
	 * Returns a page of the messages saved in the meeting in progress of a room, newest first. The page is
	 * empty when the meeting does not save its chat.
	 *
	 * @param roomId - The ID of the room
	 * @param participantIdentity - The identity of the participant who reads the history
	 * @param page - The page size and the token of the page to continue from
	 * @throws A 403 error when the participant is not in the meeting (no meeting in progress included), a 503
	 * error when LiveKit refuses the connection and a 400 error when the page token is not one this API issued
	 */
	async listMessages(
		roomId: string,
		participantIdentity: string,
		page: { maxItems: number; nextPageToken?: string }
	): Promise<PaginatedResult<MeetChatMessage>> {
		if (!(await this.meetingService.isInMeeting(roomId, participantIdentity))) {
			throw errorChatReaderNotInMeeting(participantIdentity, roomId);
		}

		const meetingRoom = await this.livekitService.findRoomOrUnavailable(roomId);

		if (!meetingRoom) {
			throw errorChatReaderNotInMeeting(participantIdentity, roomId);
		}

		if (!MeetRoomHelper.metadataSavesChat(meetingRoom.metadata)) {
			return { items: [], isTruncated: false };
		}

		return this.chatMessageRepository.findByMeeting(roomId, meetingRoom.sid, page);
	}
}
