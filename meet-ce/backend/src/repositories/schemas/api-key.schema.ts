import { MeetApiKey } from '@openvidu-meet/typings';
import { Document, model, Schema } from 'mongoose';
import { INTERNAL_CONFIG } from '../../config/internal-config.js';

/**
 * Mongoose Document interface for API keys.
 * Extends the MeetApiKey interface with MongoDB Document functionality.
 */
export interface MeetApiKeyDocument extends MeetApiKey, Document {
	/** Schema version for migration tracking (internal use only) */
	schemaVersion?: number;
}

const MeetApiKeySchema = new Schema<MeetApiKeyDocument>(
	{
		schemaVersion: {
			type: Number,
			required: true,
			default: INTERNAL_CONFIG.API_KEY_SCHEMA_VERSION
		},
		key: { type: String, required: true },
		creationDate: { type: Number, required: true }
	},
	{
		toObject: {
			versionKey: false,
			transform: (_doc, ret) => {
				delete ret._id;
				delete ret.schemaVersion;
				return ret;
			}
		}
	}
);

// Create indexes for efficient querying
MeetApiKeySchema.index({ key: 1 }, { unique: true });

export const meetApiKeyCollectionName = 'MeetApiKey';

/**
 * Mongoose model for API key entity.
 */
export const MeetApiKeyModel = model<MeetApiKeyDocument>(meetApiKeyCollectionName, MeetApiKeySchema);
