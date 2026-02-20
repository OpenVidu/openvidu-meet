import { generateSchemaMigrationName, SchemaMigrationMap, SchemaTransform } from '../models/migration.model.js';
import {
	meetGlobalConfigCollectionName,
	MeetGlobalConfigDocument
} from '../models/mongoose-schemas/global-config.schema.js';

const globalConfigMigrationV1ToV2Name = generateSchemaMigrationName(meetGlobalConfigCollectionName, 1, 2);

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

/**
 * Schema migrations for MeetGlobalConfig.
 * Key format: schema_{collection}_v{from}_to_v{to}
 */
export const globalConfigMigrations: SchemaMigrationMap<MeetGlobalConfigDocument> = new Map([
	[globalConfigMigrationV1ToV2Name, globalConfigMigrationV1ToV2Transform]
]);
