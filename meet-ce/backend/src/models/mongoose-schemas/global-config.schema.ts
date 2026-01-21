import { GlobalConfig, OAuthProvider } from '@openvidu-meet/typings';
import { Document, model, Schema } from 'mongoose';
import { INTERNAL_CONFIG } from '../../config/internal-config.js';
import { MeetAppearanceConfigSchema } from './room.schema.js';

/**
 * Mongoose Document interface for GlobalConfig.
 * Extends the GlobalConfig interface with MongoDB Document functionality.
 */
export interface MeetGlobalConfigDocument extends GlobalConfig, Document {
	/** Schema version for migration tracking (internal use only) */
	schemaVersion?: number;
}

/**
 * Sub-schema for OAuth provider configuration.
 */
const OAuthProviderConfigSchema = new Schema(
	{
		provider: {
			type: String,
			enum: Object.values(OAuthProvider),
			required: true
		},
		clientId: {
			type: String,
			required: true
		},
		clientSecret: {
			type: String,
			required: true
		},
		redirectUri: {
			type: String,
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
		allowUserCreation: {
			type: Boolean,
			required: true
		},
		oauthProviders: {
			type: [OAuthProviderConfigSchema],
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
		schemaVersion: {
			type: Number,
			required: true,
			default: INTERNAL_CONFIG.GLOBAL_CONFIG_SCHEMA_VERSION
		},
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
				delete ret.schemaVersion;
				return ret;
			}
		}
	}
);

// Create indexes for efficient querying
MeetGlobalConfigSchema.index({ projectId: 1 }, { unique: true });

export const meetGlobalConfigCollectionName = 'MeetGlobalConfig';

/**
 * Mongoose model for GlobalConfig entity.
 */
export const MeetGlobalConfigModel = model<MeetGlobalConfigDocument>(
	meetGlobalConfigCollectionName,
	MeetGlobalConfigSchema
);
