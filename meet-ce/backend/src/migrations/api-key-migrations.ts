import { SchemaMigrationMap } from '../models/migration.model.js';
import { MeetApiKeyDocument } from '../models/mongoose-schemas/api-key.schema.js';

/**
 * Schema migrations for MeetApiKey.
 * Key format: schema_{collection}_v{from}_to_v{to}
 *
 * Example:
 *
 * const apiKeyMigrationV1ToV2Name = generateSchemaMigrationName(meetApiKeyCollectionName, 1, 2);
 *
 * const apiKeyMigrationV1ToV2Transform: SchemaTransform<MeetApiKeyDocument> = (apiKey) => {
 * 	apiKey.expirationDate = undefined;
 * 	return apiKey;
 * };
 */
export const apiKeyMigrations: SchemaMigrationMap<MeetApiKeyDocument> = new Map([
	// [apiKeyMigrationV1ToV2Name, apiKeyMigrationV1ToV2Transform]
]);
