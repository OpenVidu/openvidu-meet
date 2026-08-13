import type { MeetRoomMemberPermissions } from '@openvidu-meet/typings';
import { normalizePermissions } from '@openvidu-meet/typings';
import type { SchemaMigrationMap, SchemaTransform } from '../models/migration.model.js';
import { generateSchemaMigrationName } from '../models/migration.model.js';
import type { MeetRoomMemberDocument } from '../models/mongoose-schemas/room-member.schema.js';
import { meetRoomMemberCollectionName } from '../models/mongoose-schemas/room-member.schema.js';

const roomMemberMigrationV1ToV2Name = generateSchemaMigrationName(meetRoomMemberCollectionName, 1, 2);

// v1→v2: bring customPermissions and effectivePermissions to the current key set through
// normalizePermissions(), which does both halves of the job. It renames the deprecated `can*` spellings
// to the current moduleAbility scheme, deriving the mapping from MEET_PERMISSION_ALIASES (splitting
// canRetrieveRecordings into recordingList/recordingPlay/recordingDownload, which each inherit whatever
// the old flag granted), and it fills in the keys added after that rename from the permission that used
// to govern the same capability (MEET_UNALIASED_PERMISSION_KEYS: `meetingRead` inherits `meetingJoin`).
// Both halves are mandatory for effectivePermissions, which the Mongoose schema requires in full: an
// unrenamed key is silently dropped on the next write and a missing one fails validation (see B1 in the
// migration plan). customPermissions is a partial overlay, so a partial result is expected there — the
// inherited key only appears where the member already overrode the permission it inherits from, and an
// untouched overlay keeps deferring to its role. Keeping both halves in a single step is only correct
// while v2 is unreleased — once a release ships it, a later permission needs its own v2→v3 step or the
// documents already at v2 never get it.
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
