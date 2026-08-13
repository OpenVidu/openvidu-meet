import type { MeetWebhook } from '@openvidu-meet/typings';
import { MeetWebhookEventType } from '@openvidu-meet/typings';
import { model, Schema } from 'mongoose';
import { INTERNAL_CONFIG } from '../../config/internal-config.js';
import type { DocumentOnlyField } from '../database.model.js';
import type { SchemaMigratableDocument } from '../migration.model.js';

/**
 * Mongoose Document interface for webhooks.
 * Extends the MeetWebhook interface with schemaVersion for migration tracking.
 */
export interface MeetWebhookDocument extends MeetWebhook, SchemaMigratableDocument {}

/**
 * Type for fields in MeetWebhookDocument that are not present in MeetWebhook domain model.
 */
export type MeetWebhookDocumentOnlyField = DocumentOnlyField<MeetWebhookDocument, MeetWebhook>;

/**
 * List of fields that exist only in the MeetWebhookDocument and not in the MeetWebhook domain model.
 * IMPORTANT: Update this list if new document-only fields are added to the MeetWebhookDocument interface
 */
export const MEET_WEBHOOK_DOCUMENT_ONLY_FIELDS = [
	'schemaVersion'
] as const satisfies readonly MeetWebhookDocumentOnlyField[];

/**
 * Mongoose schema for MeetWebhook entity.
 * Defines the structure and validation rules for webhook documents in MongoDB.
 */
const MeetWebhookSchema = new Schema<MeetWebhookDocument>(
	{
		schemaVersion: {
			type: Number,
			required: true,
			default: INTERNAL_CONFIG.WEBHOOK_SCHEMA_VERSION
		},
		webhookId: {
			type: String,
			required: true
		},
		url: {
			type: String,
			required: true
		},
		events: {
			type: [String],
			enum: Object.values(MeetWebhookEventType),
			// An absent array means "every event type"; without this, Mongoose would persist [].
			default: undefined
		},
		roomId: {
			type: String
		},
		enabled: {
			type: Boolean,
			required: true
		},
		creationDate: {
			type: Number,
			required: true
		}
	},
	{
		versionKey: false
	}
);

// Create indexes for efficient querying
MeetWebhookSchema.index({ webhookId: 1 }, { unique: true });

export const meetWebhookCollectionName = 'MeetWebhook';

/**
 * Mongoose model for MeetWebhook entity.
 */
export const MeetWebhookModel = model<MeetWebhookDocument>(meetWebhookCollectionName, MeetWebhookSchema);
