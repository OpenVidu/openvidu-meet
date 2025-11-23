import { ISchemaMigration } from '../models/migration.model.js';
import { MeetGlobalConfigDocument } from '../models/mongoose-schemas/global-config.schema.js';

/**
 * All migrations for the MeetGlobalConfig collection in chronological order.
 * Add new migrations to this array as the schema evolves.
 *
 * Example migration (when needed in the future):
 *
 * class GlobalConfigMigrationV1ToV2 extends BaseSchemaMigration<MeetGlobalConfigDocument> {
 *   fromVersion = 1;
 *   toVersion = 2;
 *   description = 'Add new branding configuration section';
 *
 *   protected async transform(document: MeetGlobalConfigDocument): Promise<Partial<MeetGlobalConfigDocument>> {
 *     return {
 *       brandingConfig: {
 *         logoUrl: '',
 *         companyName: 'OpenVidu Meet'
 *       }
 *     };
 *   }
 * }
 */
export const globalConfigMigrations: ISchemaMigration<MeetGlobalConfigDocument>[] = [
	// Migrations will be added here as the schema evolves
];
