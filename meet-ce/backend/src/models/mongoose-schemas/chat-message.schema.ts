import type { MeetChatMessage } from '@openvidu-meet/typings';
import { MeetParticipantType } from '@openvidu-meet/typings';
import { model, Schema } from 'mongoose';
import { INTERNAL_CONFIG } from '../../config/internal-config.js';
import type { DocumentOnlyField } from '../database.model.js';
import type { SchemaMigratableDocument } from '../migration.model.js';

/**
 * Mongoose Document interface for saved chat messages.
 * Extends the MeetChatMessage interface with schemaVersion for migration tracking.
 */
export interface MeetChatMessageDocument extends MeetChatMessage, SchemaMigratableDocument {}

/**
 * Type for fields in MeetChatMessageDocument that are not present in MeetChatMessage domain model.
 */
export type MeetChatMessageDocumentOnlyField = DocumentOnlyField<MeetChatMessageDocument, MeetChatMessage>;

/**
 * List of fields that exist only in the MeetChatMessageDocument and not in the MeetChatMessage domain model.
 * IMPORTANT: Update this list if new document-only fields are added to the MeetChatMessageDocument interface
 */
export const MEET_CHAT_MESSAGE_DOCUMENT_ONLY_FIELDS = [
	'schemaVersion'
] as const satisfies readonly MeetChatMessageDocumentOnlyField[];

/**
 * Mongoose schema for MeetChatMessage entity.
 * Defines the structure and validation rules for saved chat message documents in MongoDB.
 */
const MeetChatMessageSchema = new Schema<MeetChatMessageDocument>(
	{
		schemaVersion: {
			type: Number,
			required: true,
			default: INTERNAL_CONFIG.CHAT_MESSAGE_SCHEMA_VERSION
		},
		roomId: {
			type: String,
			required: true
		},
		meetingId: {
			type: String,
			required: true
		},
		messageId: {
			type: String,
			required: true
		},
		channel: {
			type: String,
			enum: ['all'],
			required: true
		},
		sendDate: {
			type: Number,
			required: true
		},
		meetingStartDate: {
			type: Number,
			required: true
		},
		text: {
			type: String,
			required: true
		},
		participant: {
			identity: {
				type: String,
				required: false
			},
			name: {
				type: String,
				required: false
			},
			type: {
				type: String,
				enum: [...Object.values(MeetParticipantType), 'system'],
				required: true
			}
		}
	},
	{
		versionKey: false
	}
);

// A message is stored once per sender and message id, however many times its sender sends it
MeetChatMessageSchema.index({ roomId: 1, 'participant.identity': 1, messageId: 1 }, { unique: true });
// The history of a meeting, paged by when the messages were stored
MeetChatMessageSchema.index({ roomId: 1, meetingId: 1, sendDate: 1, _id: 1 });
MeetChatMessageSchema.index({ schemaVersion: 1 });

export const meetChatMessageCollectionName = 'MeetChatMessage';

/**
 * Mongoose model for MeetChatMessage entity.
 */
export const MeetChatMessageModel = model<MeetChatMessageDocument>(
	meetChatMessageCollectionName,
	MeetChatMessageSchema
);
