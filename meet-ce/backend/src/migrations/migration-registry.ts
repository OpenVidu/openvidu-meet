import { INTERNAL_CONFIG } from '../config/internal-config.js';
import { CollectionMigrationRegistry } from '../models/migration.model.js';
import {
	MeetApiKeyModel,
	MeetGlobalConfigModel,
	MeetRecordingModel,
	MeetRoomModel,
	MeetUserModel,
	meetApiKeyCollectionName,
	meetGlobalConfigCollectionName,
	meetRecordingCollectionName,
	meetRoomCollectionName,
	meetUserCollectionName
} from '../models/mongoose-schemas/index.js';
import { apiKeyMigrations } from './api-key-migrations.js';
import { globalConfigMigrations } from './global-config-migrations.js';
import { recordingMigrations } from './recording-migrations.js';
import { roomMigrations } from './room-migrations.js';
import { userMigrations } from './user-migrations.js';

/**
 * Central registry of all collection migrations.
 * Defines the current version and migration path for each collection.
 *
 * Order matters: collections should be listed in dependency order.
 * For example, if recordings depend on rooms, rooms should come first.
 */
export const migrationRegistry: CollectionMigrationRegistry[] = [
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
