import { SchemaMigrationMap } from '../models/migration.model.js';
import { MeetUserDocument } from '../models/mongoose-schemas/user.schema.js';

/**
 * Schema migrations for MeetUser.
 * Key format: schema_{collection}_v{from}_to_v{to}
 *
 * Example:
 *
 * const userMigrationV1ToV2Name = generateSchemaMigrationName(meetUserCollectionName, 1, 2);
 *
 * const userMigrationV1ToV2Transform: SchemaTransform<MeetUserDocument> = (user) => {
 * 	user.newField = 'defaultValue';
 * 	return user;
 * };
 */
export const userMigrations: SchemaMigrationMap<MeetUserDocument> = new Map([
	// [userMigrationV1ToV2Name, userMigrationV1ToV2Transform]
]);
