import { MeetApiKey } from '@openvidu-meet/typings';
import { model, Schema } from 'mongoose';
import { INTERNAL_CONFIG } from '../../config/internal-config.js';
import { SchemaMigratableDocument } from '../migration.model.js';

/**
 * Mongoose Document interface for API keys.
 * Extends the MeetApiKey interface with schemaVersion for migration tracking.
 */
export interface MeetApiKeyDocument extends MeetApiKey, SchemaMigratableDocument {}

/**
 * Mongoose schema for MeetApiKey entity.
 * Defines the structure and validation rules for API key documents in MongoDB.
 */
const MeetApiKeySchema = new Schema<MeetApiKeyDocument>(
	{
		schemaVersion: {
			type: Number,
			required: true,
			default: INTERNAL_CONFIG.API_KEY_SCHEMA_VERSION
		},
		key: {
			type: String,
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
MeetApiKeySchema.index({ key: 1 }, { unique: true });

export const meetApiKeyCollectionName = 'MeetApiKey';

/**
 * Mongoose model for MeetApiKey entity.
 */
export const MeetApiKeyModel = model<MeetApiKeyDocument>(meetApiKeyCollectionName, MeetApiKeySchema);
