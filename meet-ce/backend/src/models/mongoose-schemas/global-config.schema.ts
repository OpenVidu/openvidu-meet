import { GlobalConfig, OAuthProvider } from '@openvidu-meet/typings';
import { model, Schema } from 'mongoose';
import { INTERNAL_CONFIG } from '../../config/internal-config.js';
import { MeetAppearanceConfigSchema } from './room.schema.js';
import { SchemaMigratableDocument } from '../migration.model.js';

/**
 * Mongoose Document interface for global config.
 * Extends the GlobalConfig interface with schemaVersion for migration tracking.
 */
export interface MeetGlobalConfigDocument extends GlobalConfig, SchemaMigratableDocument {}

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
 * Defines the structure and validation rules for the global configuration document in MongoDB.
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
		versionKey: false
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
