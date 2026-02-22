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
import {
	meetRoomMemberCollectionName,
	MeetRoomMemberDocument,
	MeetRoomMemberModel
} from '../models/mongoose-schemas/room-member.schema.js';
import { meetRoomCollectionName, MeetRoomDocument, MeetRoomModel } from '../models/mongoose-schemas/room.schema.js';
import { meetUserCollectionName, MeetUserDocument, MeetUserModel } from '../models/mongoose-schemas/user.schema.js';
import { apiKeyMigrations } from './api-key-migrations.js';
import { globalConfigMigrations } from './global-config-migrations.js';
import { recordingMigrations } from './recording-migrations.js';
import { roomMemberMigrations } from './room-member-migrations.js';
import { roomMigrations } from './room-migrations.js';
import { userMigrations } from './user-migrations.js';

/**
 * Registry configuration for MeetGlobalConfig collection migrations.
 */
const globalConfigMigrationRegistry: CollectionMigrationRegistry<MeetGlobalConfigDocument> = {
	collectionName: meetGlobalConfigCollectionName,
	model: MeetGlobalConfigModel,
	currentVersion: INTERNAL_CONFIG.GLOBAL_CONFIG_SCHEMA_VERSION,
	migrations: globalConfigMigrations
};

/**
 * Registry configuration for MeetApiKey collection migrations.
 */
const apiKeyMigrationRegistry: CollectionMigrationRegistry<MeetApiKeyDocument> = {
	collectionName: meetApiKeyCollectionName,
	model: MeetApiKeyModel,
	currentVersion: INTERNAL_CONFIG.API_KEY_SCHEMA_VERSION,
	migrations: apiKeyMigrations
};

/**
 * Registry configuration for MeetUser collection migrations.
 */
const userMigrationRegistry: CollectionMigrationRegistry<MeetUserDocument> = {
	collectionName: meetUserCollectionName,
	model: MeetUserModel,
	currentVersion: INTERNAL_CONFIG.USER_SCHEMA_VERSION,
	migrations: userMigrations
};

/**
 * Registry configuration for MeetRoom collection migrations.
 */
const roomMigrationRegistry: CollectionMigrationRegistry<MeetRoomDocument> = {
	collectionName: meetRoomCollectionName,
	model: MeetRoomModel,
	currentVersion: INTERNAL_CONFIG.ROOM_SCHEMA_VERSION,
	migrations: roomMigrations
};

/**
 * Registry configuration for MeetRoomMember collection migrations.
 */
const roomMemberMigrationRegistry: CollectionMigrationRegistry<MeetRoomMemberDocument> = {
	collectionName: meetRoomMemberCollectionName,
	model: MeetRoomMemberModel,
	currentVersion: INTERNAL_CONFIG.ROOM_MEMBER_SCHEMA_VERSION,
	migrations: roomMemberMigrations
};

/**
 * Registry configuration for MeetRecording collection migrations.
 */
const recordingMigrationRegistry: CollectionMigrationRegistry<MeetRecordingDocument> = {
	collectionName: meetRecordingCollectionName,
	model: MeetRecordingModel,
	currentVersion: INTERNAL_CONFIG.RECORDING_SCHEMA_VERSION,
	migrations: recordingMigrations
};

/**
 * Central registry of all collection migrations.
 */
const migrationRegistry = [
	globalConfigMigrationRegistry,
	apiKeyMigrationRegistry,
	userMigrationRegistry,
	roomMigrationRegistry,
	roomMemberMigrationRegistry,
	recordingMigrationRegistry
];

/**
 * Homogeneous runtime view of the migration registry.
 * Used by migration execution code that iterates over all collections.
 */
export const runtimeMigrationRegistry =
	migrationRegistry as unknown as CollectionMigrationRegistry<SchemaMigratableDocument>[];
