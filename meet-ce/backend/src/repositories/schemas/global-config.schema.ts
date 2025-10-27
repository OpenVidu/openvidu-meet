import { GlobalConfig } from '@openvidu-meet/typings';
import { Document, model, Schema } from 'mongoose';

/**
 * Mongoose Document interface for GlobalConfig.
 * Extends the GlobalConfig interface with MongoDB Document functionality.
 */
export interface MeetGlobalConfigDocument extends GlobalConfig, Document {}

/**
 * Mongoose schema for GlobalConfig entity.
 * Defines the structure for the global configuration document in MongoDB.
 */
const MeetGlobalConfigSchema = new Schema<MeetGlobalConfigDocument>(
	{
		projectId: {
			type: String,
			required: true
		},
		securityConfig: {
			type: Schema.Types.Mixed,
			required: true
		},
		webhooksConfig: {
			type: Schema.Types.Mixed,
			required: true
		},
		roomsConfig: {
			type: Schema.Types.Mixed,
			required: true
		}
	},
	{
		collection: 'globalconfig',
		toObject: {
			versionKey: false,
			transform: (_doc, ret) => {
				delete ret._id;
				return ret;
			}
		}
	}
);

/**
 * Mongoose model for GlobalConfig entity.
 */
export const MeetGlobalConfigModel = model<MeetGlobalConfigDocument>('MeetGlobalConfig', MeetGlobalConfigSchema);
