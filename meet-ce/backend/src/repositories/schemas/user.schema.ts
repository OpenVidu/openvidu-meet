import { User, UserRole } from '@openvidu-meet/typings';
import { Document, model, Schema } from 'mongoose';

/**
 * Mongoose Document interface for User.
 * Extends the User interface with MongoDB Document functionality.
 */
export interface UserDocument extends User, Document {}

/**
 * Mongoose schema for User entity.
 * Defines the structure and validation rules for user documents in MongoDB.
 */
const UserSchema = new Schema<UserDocument>(
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
			enum: Object.values(UserRole),
			required: true,
			default: [UserRole.USER]
		}
	},
	{
		toObject: {
			versionKey: false,
			transform: (doc, ret) => {
				delete ret._id;
				return ret;
			}
		}
	}
);

// Create indexes for efficient querying
UserSchema.index({ username: 1 }, { unique: true });

/**
 * Mongoose model for User entity.
 */
export const UserModel = model<UserDocument>('MeetUser', UserSchema);
