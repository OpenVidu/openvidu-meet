import { AuthMode, AuthType, GlobalConfig, MeetRoomThemeMode } from '@openvidu-meet/typings';
import { Document, model, Schema } from 'mongoose';

/**
 * Mongoose Document interface for GlobalConfig.
 * Extends the GlobalConfig interface with MongoDB Document functionality.
 */
export interface MeetGlobalConfigDocument extends GlobalConfig, Document {}

/**
 * Sub-schema for authentication method.
 * Currently only supports single_user type.
 */
const AuthMethodSchema = new Schema(
	{
		type: {
			type: String,
			enum: Object.values(AuthType),
			required: true
		}
	},
	{ _id: false }
);

/**
 * Sub-schema for authentication configuration.
 */
const AuthenticationConfigSchema = new Schema(
	{
		authMethod: {
			type: AuthMethodSchema,
			required: true
		},
		authModeToAccessRoom: {
			type: String,
			enum: Object.values(AuthMode),
			required: true
		}
	},
	{ _id: false }
);

/**
 * Sub-schema for security configuration.
 */
const SecurityConfigSchema = new Schema(
	{
		authentication: {
			type: AuthenticationConfigSchema,
			required: true
		}
	},
	{ _id: false }
);

/**
 * Sub-schema for webhook configuration.
 */
const WebhookConfigSchema = new Schema(
	{
		enabled: {
			type: Boolean,
			required: true
		},
		url: {
			type: String,
			required: false
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
const MeetAppearanceConfigSchema = new Schema(
	{
		themes: {
			type: [MeetRoomThemeSchema],
			required: true
		}
	},
	{ _id: false }
);

/**
 * Sub-schema for rooms configuration.
 */
const RoomsConfigSchema = new Schema(
	{
		appearance: {
			type: MeetAppearanceConfigSchema,
			required: true
		}
	},
	{ _id: false }
);

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
			type: SecurityConfigSchema,
			required: true
		},
		webhooksConfig: {
			type: WebhookConfigSchema,
			required: true
		},
		roomsConfig: {
			type: RoomsConfigSchema,
			required: true
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
MeetGlobalConfigSchema.index({ projectId: 1 }, { unique: true });

/**
 * Mongoose model for GlobalConfig entity.
 */
export const MeetGlobalConfigModel = model<MeetGlobalConfigDocument>('MeetGlobalConfig', MeetGlobalConfigSchema);
