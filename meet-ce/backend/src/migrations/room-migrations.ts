import { ISchemaMigration } from '../models/migration.model.js';
import { MeetRoomDocument } from '../models/mongoose-schemas/index.js';

/**
 * All migrations for the MeetRoom collection in chronological order.
 * Add new migrations to this array as the schema evolves.
 *
 * Example migration (when needed in the future):
 *
 * class RoomMigrationV1ToV2 extends BaseSchemaMigration<MeetRoomDocument> {
 *   fromVersion = 1;
 *   toVersion = 2;
 *   description = 'Add new required field "maxParticipants" with default value';
 *
 *   protected async transform(document: MeetRoomDocument): Promise<Partial<MeetRoomDocument>> {
 *     return {
 *       maxParticipants: 100 // Add default value for existing rooms
 *     };
 *   }
 * }
 */
export const roomMigrations: ISchemaMigration<MeetRoomDocument>[] = [
	// Migrations will be added here as the schema evolves
	// Example: new RoomMigrationV1ToV2(),
	// Example: new RoomMigrationV2ToV3(),
];
