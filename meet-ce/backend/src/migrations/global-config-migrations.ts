import { SchemaMigrationMap } from '../models/migration.model.js';
import { MeetGlobalConfigDocument } from '../models/mongoose-schemas/global-config.schema.js';

/**
 * Schema migrations for MeetGlobalConfig.
 * Key format: schema_{collection}_v{from}_to_v{to}
 *
 * Example:
 *
 * const globalConfigMigrationV1ToV2Name = generateSchemaMigrationName(meetGlobalConfigCollectionName, 1, 2);
 * const globalConfigMigrationV1ToV2Transform: SchemaTransform<MeetGlobalConfigDocument> = () => ({
 * 	$set: {
 * 		newField: 'default-value'
 * 	}
 * });
 */
export const globalConfigMigrations: SchemaMigrationMap<MeetGlobalConfigDocument> = new Map([
	// [globalConfigMigrationV1ToV2Name, globalConfigMigrationV1ToV2Transform]
]);
