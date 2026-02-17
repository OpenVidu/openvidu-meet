import { SchemaMigrationMap } from '../models/migration.model.js';
import { MeetRoomDocument } from '../models/mongoose-schemas/room.schema.js';

/**
 * Schema migrations for MeetRoom.
 * Key format: schema_{collection}_v{from}_to_v{to}
 *
 * Example:
 *
 * const roomMigrationV1ToV2Name = generateSchemaMigrationName('MeetRoom', 1, 2);
 *
 * const roomMigrationV1ToV2Transform: SchemaTransform<MeetRoomDocument> = () => ({
 * 	$set: {
 * 		maxParticipants: 100
 * 	}
 * });
 */
export const roomMigrations: SchemaMigrationMap<MeetRoomDocument> = new Map([
	// [roomMigrationV1ToV2Name, roomMigrationV1ToV2Transform]
]);
