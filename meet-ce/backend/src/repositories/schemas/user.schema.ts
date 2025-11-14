import { MeetUser, MeetUserRole } from '@openvidu-meet/typings';
import { Document, model, Schema } from 'mongoose';

/**
 * Mongoose Document interface for User.
 * Extends the User interface with MongoDB Document functionality.
 */
export interface MeetUserDocument extends MeetUser, Document {}

/**
 * Mongoose schema for User entity.
 * Defines the structure and validation rules for user documents in MongoDB.
 */
const MeetUserSchema = new Schema<MeetUserDocument>(
	{
		username: {
			type: String,
			required: true
		},
		passwordHash: {
			type: String,
			required: true
		},
		roles: {
			type: [String],
			enum: Object.values(MeetUserRole),
			required: true,
			default: [MeetUserRole.USER]
		}
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

// Create indexes for efficient querying
MeetUserSchema.index({ username: 1 }, { unique: true });

/**
 * Mongoose model for User entity.
 */
export const MeetUserModel = model<MeetUserDocument>('MeetUser', MeetUserSchema);
