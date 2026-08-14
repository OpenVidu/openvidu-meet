import type { SchemaMigrationMap, SchemaTransform } from '../models/migration.model.js';
import { generateSchemaMigrationName } from '../models/migration.model.js';
import type {
	MeetGlobalConfigDocument
} from '../models/mongoose-schemas/global-config.schema.js';
import {
	meetGlobalConfigCollectionName
} from '../models/mongoose-schemas/global-config.schema.js';

const globalConfigMigrationV1ToV2Name = generateSchemaMigrationName(meetGlobalConfigCollectionName, 1, 2);
const globalConfigMigrationV2ToV3Name = generateSchemaMigrationName(meetGlobalConfigCollectionName, 2, 3);

const globalConfigMigrationV1ToV2Transform: SchemaTransform<MeetGlobalConfigDocument> = (globalConfig) => {
	const legacyAuthentication = globalConfig.securityConfig.authentication as unknown as {
		authMethod?: unknown;
		authModeToAccessRoom?: unknown;
	};

	globalConfig.securityConfig.authentication.oauthProviders = [];

	delete legacyAuthentication.authMethod;
	delete legacyAuthentication.authModeToAccessRoom;

	return globalConfig;
};

// v2→v3: webhooks stop being global config and become a resource of their own (the MeetWebhook
// collection). The URL configured here was moved into that collection at startup, before this
// migration runs (WebhookMigration, in webhooks-migration.ts), so this transform only drops
// the leftover field.
const globalConfigMigrationV2ToV3Transform: SchemaTransform<MeetGlobalConfigDocument> = (globalConfig) => {
	const legacyGlobalConfig = globalConfig as unknown as { webhooksConfig?: unknown };

	delete legacyGlobalConfig.webhooksConfig;

	return globalConfig;
};

/**
 * Schema migrations for MeetGlobalConfig.
 * Key format: schema_{collection}_v{from}_to_v{to}
 */
export const globalConfigMigrations: SchemaMigrationMap<MeetGlobalConfigDocument> = new Map([
	[globalConfigMigrationV1ToV2Name, globalConfigMigrationV1ToV2Transform],
	[globalConfigMigrationV2ToV3Name, globalConfigMigrationV2ToV3Transform]
]);
