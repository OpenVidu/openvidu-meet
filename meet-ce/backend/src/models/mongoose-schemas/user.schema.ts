import { MeetUser, MeetUserRole } from '@openvidu-meet/typings';
import { Document, model, Schema } from 'mongoose';
import { INTERNAL_CONFIG } from '../../config/internal-config.js';

/**
 * Mongoose Document interface for User.
 * Extends the User interface with MongoDB Document functionality.
 */
export interface MeetUserDocument extends MeetUser, Document {
	/** Schema version for migration tracking (internal use only) */
	schemaVersion?: number;
}

/**
 * Mongoose schema for User entity.
 * Defines the structure and validation rules for user documents in MongoDB.
 */
const MeetUserSchema = new Schema<MeetUserDocument>(
	{
		schemaVersion: {
			type: Number,
			required: true,
			default: INTERNAL_CONFIG.USER_SCHEMA_VERSION
		},
		userId: {
			type: String,
			required: true
		},
		name: {
			type: String,
			required: true
		},
		registrationDate: {
			type: Number,
			required: true
		},
		role: {
			type: String,
			enum: Object.values(MeetUserRole),
			required: true
		},
		passwordHash: {
			type: String,
			required: true
		}
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
MeetUserSchema.index({ userId: 1 }, { unique: true });
MeetUserSchema.index({ registrationDate: -1, _id: -1 });
MeetUserSchema.index({ name: 1, registrationDate: -1, _id: -1 });
MeetUserSchema.index({ role: 1, registrationDate: -1, _id: -1 });
MeetUserSchema.index({ name: 1, role: 1, _id: 1 });

export const meetUserCollectionName = 'MeetUser';

/**
 * Mongoose model for User entity.
 */
export const MeetUserModel = model<MeetUserDocument>(meetUserCollectionName, MeetUserSchema);
