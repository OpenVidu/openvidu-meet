import { MeetApiKey } from '@openvidu-meet/typings';
import { Document, model, Schema } from 'mongoose';

/**
 * Mongoose Document interface for API keys.
 * Extends the MeetApiKey interface with MongoDB Document functionality.
 */
export interface MeetApiKeyDocument extends MeetApiKey, Document {}

const MeetApiKeySchema = new Schema<MeetApiKeyDocument>(
	{
		key: { type: String, required: true },
		creationDate: { type: Number, required: true }
	},
	{
		toObject: {
			versionKey: false,
			transform: (_doc, ret) => {
				delete ret._id;
				return ret;
			}
		}
	}
);

export const MeetApiKeyModel = model<MeetApiKeyDocument>('MeetApiKey', MeetApiKeySchema);
