import { ISchemaMigration } from '../models/migration.model.js';
import { MeetUserDocument } from '../models/mongoose-schemas/index.js';

/**
 * All migrations for the MeetUser collection in chronological order.
 * Add new migrations to this array as the schema evolves.
 *
 * Example migration (when needed in the future):
 *
 * class UserMigrationV1ToV2 extends BaseSchemaMigration<MeetUserDocument> {
 *   fromVersion = 1;
 *   toVersion = 2;
 *   description = 'Add email field for user notifications';
 *
 *   protected async transform(document: MeetUserDocument): Promise<Partial<MeetUserDocument>> {
 *     return {
 *       email: undefined // Email will be optional initially
 *     };
 *   }
 * }
 */
export const userMigrations: ISchemaMigration<MeetUserDocument>[] = [
	// Migrations will be added here as the schema evolves
];
