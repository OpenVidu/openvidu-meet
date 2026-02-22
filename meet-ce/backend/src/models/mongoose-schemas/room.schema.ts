import {
	MeetRecordingLayout,
	MeetRoom,
	MeetRoomDeletionPolicyWithMeeting,
	MeetRoomDeletionPolicyWithRecordings,
	MeetRoomStatus,
	MeetRoomThemeMode,
	MeetingEndAction
} from '@openvidu-meet/typings';
import { Schema, model } from 'mongoose';
import { INTERNAL_CONFIG } from '../../config/internal-config.js';
import { MeetRoomMemberPermissionsSchema } from './room-member.schema.js';
import { SchemaMigratableDocument } from '../migration.model.js';

/**
 * Mongoose Document interface for rooms.
 * Extends the MeetRoom interface with schemaVersion for migration tracking.
 */
export interface MeetRoomDocument extends MeetRoom, SchemaMigratableDocument {}

/**
 * Sub-schema for auto-deletion policy.
 */
const MeetRoomAutoDeletionPolicySchema = new Schema(
	{
		withMeeting: {
			type: String,
			enum: Object.values(MeetRoomDeletionPolicyWithMeeting),
			required: true
		},
		withRecordings: {
			type: String,
			enum: Object.values(MeetRoomDeletionPolicyWithRecordings),
			required: true
		}
	},
	{ _id: false }
);

/**
 * Sub-schema recording configuration.
 */
const MeetRecordingConfigSchema = new Schema(
	{
		enabled: {
			type: Boolean,
			required: true
		},
		layout: {
			type: String,
			enum: Object.values(MeetRecordingLayout),
			required: true
		},
		encoding: {
			type: Schema.Types.Mixed,
			required: true
		}
	},
	{ _id: false }
);

/**
 * Sub-schema for chat configuration.
 */
const MeetChatConfigSchema = new Schema(
	{
		enabled: {
			type: Boolean,
			required: true
		}
	},
	{ _id: false }
);

/**
 * Sub-schema for virtual background configuration.
 */
const MeetVirtualBackgroundConfigSchema = new Schema(
	{
		enabled: {
			type: Boolean,
			required: true
		}
	},
	{ _id: false }
);

/**
 * Sub-schema for E2EE configuration.
 */
const MeetE2EEConfigSchema = new Schema(
	{
		enabled: {
			type: Boolean,
			required: true
		}
	},
	{ _id: false }
);

/**
 * Sub-schema for captions configuration.
 */
const MeetCaptionsConfigSchema = new Schema(
	{
		enabled: {
			type: Boolean,
			required: true
		}
	},
	{ _id: false }
);

/**
 * Sub-schema for room theme configuration.
 */
const MeetRoomThemeSchema = new Schema(
	{
		name: {
			type: String,
			required: true
		},
		enabled: {
			type: Boolean,
			required: true
		},
		baseTheme: {
			type: String,
			enum: Object.values(MeetRoomThemeMode),
			required: true
		},
		backgroundColor: {
			type: String,
			required: false
		},
		primaryColor: {
			type: String,
			required: false
		},
		secondaryColor: {
			type: String,
			required: false
		},
		accentColor: {
			type: String,
			required: false
		},
		surfaceColor: {
			type: String,
			required: false
		}
	},
	{ _id: false }
);

/**
 * Sub-schema for appearance configuration.
 */
export const MeetAppearanceConfigSchema = new Schema(
	{
		themes: {
			type: [MeetRoomThemeSchema],
			required: true
		}
	},
	{ _id: false }
);

/**
 * Sub-schema for room roles configuration.
 */
const MeetRoomRolesSchema = new Schema(
	{
		moderator: {
			permissions: {
				type: MeetRoomMemberPermissionsSchema,
				required: true
			}
		},
		speaker: {
			permissions: {
				type: MeetRoomMemberPermissionsSchema,
				required: true
			}
		}
	},
	{ _id: false }
);

/**
 * Sub-schema for anonymous access configuration.
 */
const MeetRoomAnonymousSchema = new Schema(
	{
		moderator: {
			enabled: {
				type: Boolean,
				required: true
			},
			accessUrl: {
				type: String,
				required: true
			}
		},
		speaker: {
			enabled: {
				type: Boolean,
				required: true
			},
			accessUrl: {
				type: String,
				required: true
			}
		}
	},
	{ _id: false }
);

/**
 * Sub-schema for room configuration.
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
			required: true
		},
		captions: {
			type: MeetCaptionsConfigSchema,
			required: true
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
		schemaVersion: {
			type: Number,
			required: true,
			default: INTERNAL_CONFIG.ROOM_SCHEMA_VERSION
		},
		roomId: {
			type: String,
			required: true
		},
		roomName: {
			type: String,
			required: true
		},
		owner: {
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
		roles: {
			type: MeetRoomRolesSchema,
			required: true
		},
		anonymous: {
			type: MeetRoomAnonymousSchema,
			required: true
		},
		accessUrl: {
			type: String,
			required: true
		},
		status: {
			type: String,
			enum: Object.values(MeetRoomStatus),
			required: true
		},
		rolesUpdatedAt: {
			type: Number,
			required: true
		},
		meetingEndAction: {
			type: String,
			enum: Object.values(MeetingEndAction),
			required: true
		}
	},
	{
		versionKey: false
	}
);

// Create indexes for efficient querying
MeetRoomSchema.index({ roomId: 1 }, { unique: true });
MeetRoomSchema.index({ creationDate: -1, _id: -1 });
MeetRoomSchema.index({ roomName: 1, creationDate: -1, _id: -1 });
MeetRoomSchema.index({ status: 1, creationDate: -1, _id: -1 });
MeetRoomSchema.index({ owner: 1, creationDate: -1, _id: -1 });
MeetRoomSchema.index({ autoDeletionDate: 1, _id: 1 });

export const meetRoomCollectionName = 'MeetRoom';

/**
 * Mongoose model for MeetRoom entity.
 */
export const MeetRoomModel = model<MeetRoomDocument>(meetRoomCollectionName, MeetRoomSchema);
