import { INTERNAL_CONFIG } from '../config/internal-config.js';
import { CollectionMigrationRegistry, SchemaMigratableDocument } from '../models/migration.model.js';
import {
	meetApiKeyCollectionName,
	MeetApiKeyDocument,
	MeetApiKeyModel
} from '../models/mongoose-schemas/api-key.schema.js';
import {
	meetGlobalConfigCollectionName,
	MeetGlobalConfigDocument,
	MeetGlobalConfigModel
} from '../models/mongoose-schemas/global-config.schema.js';
import {
	meetRecordingCollectionName,
	MeetRecordingDocument,
	MeetRecordingModel
} from '../models/mongoose-schemas/recording.schema.js';
import { meetRoomCollectionName, MeetRoomDocument, MeetRoomModel } from '../models/mongoose-schemas/room.schema.js';
import { meetUserCollectionName, MeetUserDocument, MeetUserModel } from '../models/mongoose-schemas/user.schema.js';
import { apiKeyMigrations } from './api-key-migrations.js';
import { globalConfigMigrations } from './global-config-migrations.js';
import { recordingMigrations } from './recording-migrations.js';
import { roomMigrations } from './room-migrations.js';
import { userMigrations } from './user-migrations.js';

/**
 * Central registry of all collection migrations.
 * Defines the current version and migration map for each collection.
 *
 * Order matters: collections should be listed in dependency order.
 * For example, if recordings depend on rooms, rooms should come first.
 */
const migrationRegistry: [
	CollectionMigrationRegistry<MeetGlobalConfigDocument>,
	CollectionMigrationRegistry<MeetUserDocument>,
	CollectionMigrationRegistry<MeetApiKeyDocument>,
	CollectionMigrationRegistry<MeetRoomDocument>,
	CollectionMigrationRegistry<MeetRecordingDocument>
] = [
	// GlobalConfig - no dependencies, can run first
	{
		collectionName: meetGlobalConfigCollectionName,
		model: MeetGlobalConfigModel,
		currentVersion: INTERNAL_CONFIG.GLOBAL_CONFIG_SCHEMA_VERSION,
		migrations: globalConfigMigrations
	},
	// User - no dependencies
	{
		collectionName: meetUserCollectionName,
		model: MeetUserModel,
		currentVersion: INTERNAL_CONFIG.USER_SCHEMA_VERSION,
		migrations: userMigrations
	},
	// ApiKey - no dependencies
	{
		collectionName: meetApiKeyCollectionName,
		model: MeetApiKeyModel,
		currentVersion: INTERNAL_CONFIG.API_KEY_SCHEMA_VERSION,
		migrations: apiKeyMigrations
	},
	// Room - no dependencies on other collections
	{
		collectionName: meetRoomCollectionName,
		model: MeetRoomModel,
		currentVersion: INTERNAL_CONFIG.ROOM_SCHEMA_VERSION,
		migrations: roomMigrations
	},
	// Recording - depends on Room (references roomId)
	// Should be migrated after rooms
	{
		collectionName: meetRecordingCollectionName,
		model: MeetRecordingModel,
		currentVersion: INTERNAL_CONFIG.RECORDING_SCHEMA_VERSION,
		migrations: recordingMigrations
	}
];

/**
 * Homogeneous runtime view of the migration registry.
 * Used by migration execution code that iterates over all collections.
 */
export const runtimeMigrationRegistry =
	migrationRegistry as unknown as CollectionMigrationRegistry<SchemaMigratableDocument>[];
