import type { MeetRoomMemberPermissions } from '@openvidu-meet/typings';
import { normalizePermissions } from '@openvidu-meet/typings';
import type { SchemaMigrationMap, SchemaTransform } from '../models/migration.model.js';
import { generateSchemaMigrationName } from '../models/migration.model.js';
import type { MeetRoomMemberDocument } from '../models/mongoose-schemas/room-member.schema.js';
import { meetRoomMemberCollectionName } from '../models/mongoose-schemas/room-member.schema.js';

const roomMemberMigrationV1ToV2Name = generateSchemaMigrationName(meetRoomMemberCollectionName, 1, 2);

// v1→v2: rename the permission keys of customPermissions and effectivePermissions from the legacy
// `can*` spellings to the canonical moduleAbility scheme, deriving the mapping from
// MEET_PERMISSION_ALIASES via normalizePermissions() (which also splits canRetrieveRecordings into
// recordingList/recordingPlay/recordingDownload, granting the whole group whatever the old flag
// granted). Without this rename the canonical Mongoose schema would silently drop every stored
// permission on the next write, leaving the required effectivePermissions empty (see B1 in the
// migration plan). customPermissions is a partial overlay, so a partial result is expected there.
const roomMemberMigrationV1ToV2Transform: SchemaTransform<MeetRoomMemberDocument> = (roomMember) => {
	if (roomMember.customPermissions) {
		roomMember.customPermissions = normalizePermissions(roomMember.customPermissions);
	}

	if (roomMember.effectivePermissions) {
		roomMember.effectivePermissions = normalizePermissions(
			roomMember.effectivePermissions
		) as MeetRoomMemberPermissions;
	}

	return roomMember;
};

/**
 * Schema migrations for MeetRoomMember.
 * Key format: schema_{collection}_v{from}_to_v{to}
 */
export const roomMemberMigrations: SchemaMigrationMap<MeetRoomMemberDocument> = new Map([
	[roomMemberMigrationV1ToV2Name, roomMemberMigrationV1ToV2Transform]
]);
