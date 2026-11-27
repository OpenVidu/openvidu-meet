import type { MeetChatMessage, SortAndPagination } from '@openvidu-meet/typings';
import { SortOrder } from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import { INTERNAL_CONFIG } from '../config/internal-config.js';
import type { PaginatedResult } from '../models/database.model.js';
import type {
	MeetChatMessageDocument,
	MeetChatMessageDocumentOnlyField
} from '../models/mongoose-schemas/chat-message.schema.js';
import {
	MEET_CHAT_MESSAGE_DOCUMENT_ONLY_FIELDS,
	MeetChatMessageModel
} from '../models/mongoose-schemas/chat-message.schema.js';
import { LoggerService } from '../services/logger.service.js';
import { BaseRepository } from './base.repository.js';

const DUPLICATE_KEY_ERROR_CODE = 11000;

/**
 * A chat message as the server receives it. Its `sendDate` is the time MongoDB stores it at.
 */
export type ChatMessageToSave = Omit<MeetChatMessage, 'sendDate'>;

/**
 * Repository for managing saved chat messages in MongoDB.
 */
@injectable()
export class ChatMessageRepository extends BaseRepository<MeetChatMessage, MeetChatMessageDocument> {
	constructor(@inject(LoggerService) logger: LoggerService) {
		super(logger, MeetChatMessageModel);
	}

	protected toDomain(dbObject: MeetChatMessageDocument): MeetChatMessage {
		const { schemaVersion, ...message } = dbObject;
		void schemaVersion;
		return message;
	}

	protected override getDocumentOnlyFields(): readonly MeetChatMessageDocumentOnlyField[] {
		return MEET_CHAT_MESSAGE_DOCUMENT_ONLY_FIELDS;
	}

	/**
	 * Stores a message with MongoDB's time as its `sendDate`, once per sender and message id: a message
	 * already stored is left as it was, `sendDate` included, and counts as stored.
	 *
	 * The write is a pipeline upsert whose values are wrapped in `$literal`, since a pipeline reads
	 * a string that starts with `$` (a text such as `$5 off`, a display name) as a field path.
	 *
	 * @throws Any failure other than the message already being stored
	 */
	async save(message: ChatMessageToSave): Promise<void> {
		const { roomId, participant, messageId } = message;
		const values = { ...message, schemaVersion: INTERNAL_CONFIG.CHAT_MESSAGE_SCHEMA_VERSION };
		const literals = Object.fromEntries(
			Object.entries(values).map(([field, value]) => [field, { $literal: value }])
		);

		try {
			await this.model
				.updateOne(
					{ roomId, 'participant.identity': participant.identity, messageId, sendDate: { $exists: false } },
					[{ $set: { ...literals, sendDate: { $toLong: '$$NOW' } } }],
					{ upsert: true, updatePipeline: true }
				)
				.exec();
		} catch (error) {
			if ((error as { code?: unknown }).code !== DUPLICATE_KEY_ERROR_CODE) {
				this.logger.error(`Error saving chat message '${messageId}' of room '${roomId}':`, error);
				throw error;
			}

			this.logger.debug(`Chat message '${messageId}' of room '${roomId}' was already saved`);
		}
	}

	/**
	 * Returns a page of the messages of one meeting, newest first.
	 *
	 * @param roomId - The room the meeting belongs to
	 * @param meetingId - The LiveKit sid of the meeting
	 * @param options - The page size and the token of the page to continue from
	 */
	findByMeeting(
		roomId: string,
		meetingId: string,
		options: Pick<SortAndPagination, 'maxItems' | 'nextPageToken'>
	): Promise<PaginatedResult<MeetChatMessage>> {
		return this.findMany({ roomId, meetingId }, { ...options, sortField: 'sendDate', sortOrder: SortOrder.DESC });
	}

	/**
	 * Removes all the messages of a room.
	 * Does not fail if the room has none.
	 *
	 * @param roomId - The ID of the room
	 */
	deleteAllByRoomId(roomId: string): Promise<void> {
		return this.deleteMany({ roomId }, false);
	}
}
