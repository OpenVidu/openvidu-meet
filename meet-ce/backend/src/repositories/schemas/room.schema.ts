import {
	MeetRecordingAccess,
	MeetRoom,
	MeetRoomDeletionPolicyWithMeeting,
	MeetRoomDeletionPolicyWithRecordings,
	MeetRoomStatus,
	MeetingEndAction
} from '@openvidu-meet/typings';
import { Document, Schema, model } from 'mongoose';

/**
 * Mongoose Document interface for MeetRoom.
 * Extends the MeetRoom interface with MongoDB Document functionality.
 */
export interface MeetRoomDocument extends MeetRoom, Document {}

/**
 * Mongoose schema for MeetRoom auto-deletion policy.
 */
const MeetRoomAutoDeletionPolicySchema = new Schema(
	{
		withMeeting: {
			type: String,
			enum: Object.values(MeetRoomDeletionPolicyWithMeeting),
			required: true,
			default: MeetRoomDeletionPolicyWithMeeting.FAIL
		},
		withRecordings: {
			type: String,
			enum: Object.values(MeetRoomDeletionPolicyWithRecordings),
			required: true,
			default: MeetRoomDeletionPolicyWithRecordings.FAIL
		}
	},
	{ _id: false }
);

/**
 * Mongoose schema for MeetRoom recording configuration.
 */
const MeetRecordingConfigSchema = new Schema(
	{
		enabled: {
			type: Boolean,
			required: true,
			default: false
		},
		allowAccessTo: {
			type: String,
			enum: Object.values(MeetRecordingAccess),
			required: false
		}
	},
	{ _id: false }
);

/**
 * Mongoose schema for MeetRoom chat configuration.
 */
const MeetChatConfigSchema = new Schema(
	{
		enabled: {
			type: Boolean,
			required: true,
			default: true
		}
	},
	{ _id: false }
);

/**
 * Mongoose schema for MeetRoom virtual background configuration.
 */
const MeetVirtualBackgroundConfigSchema = new Schema(
	{
		enabled: {
			type: Boolean,
			required: true,
			default: true
		}
	},
	{ _id: false }
);

/**
 * Mongoose schema for MeetRoom E2EE configuration.
 */
const MeetE2EEConfigSchema = new Schema(
	{
		enabled: {
			type: Boolean,
			required: true,
			default: false
		}
	},
	{ _id: false }
);

/**
 * Mongoose schema for MeetRoom configuration.
 */
const MeetRoomConfigSchema = new Schema(
	{
		chat: {
			type: MeetChatConfigSchema,
			required: true
		},
		recording: {
			type: MeetRecordingConfigSchema,
			required: true
		},
		virtualBackground: {
			type: MeetVirtualBackgroundConfigSchema,
			required: true
		},
		e2ee: {
			type: MeetE2EEConfigSchema,
			required: false
		}
	},
	{ _id: false }
);

/**
 * Mongoose schema for MeetRoom entity.
 * Defines the structure and validation rules for room documents in MongoDB.
 */
const MeetRoomSchema = new Schema<MeetRoomDocument>(
	{
		roomId: {
			type: String,
			required: true
		},
		roomName: {
			type: String,
			required: true
		},
		creationDate: {
			type: Number,
			required: true
		},
		autoDeletionDate: {
			type: Number,
			required: false
		},
		autoDeletionPolicy: {
			type: MeetRoomAutoDeletionPolicySchema,
			required: false
		},
		config: {
			type: MeetRoomConfigSchema,
			required: true
		},
		moderatorUrl: {
			type: String,
			required: true
		},
		speakerUrl: {
			type: String,
			required: true
		},
		status: {
			type: String,
			enum: Object.values(MeetRoomStatus),
			required: true,
			default: MeetRoomStatus.OPEN
		},
		meetingEndAction: {
			type: String,
			enum: Object.values(MeetingEndAction),
			required: true,
			default: MeetingEndAction.NONE
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
MeetRoomSchema.index({ roomId: 1 }, { unique: true });
MeetRoomSchema.index({ creationDate: -1, _id: -1 });
MeetRoomSchema.index({ roomName: 1, creationDate: -1, _id: -1 });
MeetRoomSchema.index({ status: 1, creationDate: -1, _id: -1 });
MeetRoomSchema.index({ autoDeletionDate: 1 });

/**
 * Mongoose model for MeetRoom.
 */
export const MeetRoomModel = model<MeetRoomDocument>('MeetRoom', MeetRoomSchema);
