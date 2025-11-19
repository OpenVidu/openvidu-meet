import { ISchemaMigration } from '../models/migration.model.js';
import { MeetApiKeyDocument } from '../models/mongoose-schemas/index.js';

/**
 * All migrations for the MeetApiKey collection in chronological order.
 * Add new migrations to this array as the schema evolves.
 *
 * Example migration (when needed in the future):
 *
 * class ApiKeyMigrationV1ToV2 extends BaseSchemaMigration<MeetApiKeyDocument> {
 *   fromVersion = 1;
 *   toVersion = 2;
 *   description = 'Add expirationDate field for API key expiration';
 *
 *   protected async transform(document: MeetApiKeyDocument): Promise<Partial<MeetApiKeyDocument>> {
 *     return {
 *       expirationDate: undefined // No expiration for existing keys
 *     };
 *   }
 * }
 */
export const apiKeyMigrations: ISchemaMigration<MeetApiKeyDocument>[] = [
	// Migrations will be added here as the schema evolves
];
