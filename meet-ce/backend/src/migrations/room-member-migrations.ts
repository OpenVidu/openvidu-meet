import { SchemaMigrationMap } from '../models/migration.model.js';
import { MeetRoomMemberDocument } from '../models/mongoose-schemas/room-member.schema.js';

/**
 * Schema migrations for MeetRoomMember.
 * Key format: schema_{collection}_v{from}_to_v{to}
 *
 * Example:
 *
 * const roomMemberMigrationV1ToV2Name = generateSchemaMigrationName(meetRoomMemberCollectionName, 1, 2);
 *
 * const roomMemberMigrationV1ToV2Transform: SchemaTransform<MeetRoomMemberDocument> = (roomMember) => {
 * 	roomMember.permissionsUpdatedAt = Date.now();
 * 	return roomMember;
 * };
 */
export const roomMemberMigrations: SchemaMigrationMap<MeetRoomMemberDocument> = new Map([
	// [roomMemberMigrationV1ToV2Name, roomMemberMigrationV1ToV2Transform]
]);
