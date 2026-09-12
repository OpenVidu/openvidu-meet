import type { MeetRoomMemberPermissions } from '@openvidu-meet/typings';
import { normalizePermissions } from '@openvidu-meet/typings';
import type { SchemaMigrationMap, SchemaTransform } from '../models/migration.model.js';
import { generateSchemaMigrationName } from '../models/migration.model.js';
import type { MeetRoomMemberDocument } from '../models/mongoose-schemas/room-member.schema.js';
import { meetRoomMemberCollectionName } from '../models/mongoose-schemas/room-member.schema.js';

const roomMemberMigrationV1ToV2Name = generateSchemaMigrationName(meetRoomMemberCollectionName, 1, 2);
const roomMemberMigrationV2ToV3Name = generateSchemaMigrationName(meetRoomMemberCollectionName, 2, 3);

// Brings customPermissions and effectivePermissions to the current key set through
// normalizePermissions(), which does both halves of the job. It renames the deprecated `can*` spellings
// to the current moduleAbility scheme, deriving the mapping from MEET_PERMISSION_ALIASES (splitting
// canRetrieveRecordings into recordingList/recordingPlay/recordingDownload, which each inherit whatever
// the old flag granted), and it completes the keys added after that rename in the sets that must be
// whole (MEET_UNALIASED_PERMISSION_KEYS). Both halves are mandatory for effectivePermissions, which the
// Mongoose schema requires in full: an unrenamed key is silently dropped on the next write and a missing
// one fails validation (see B1 in the migration plan). customPermissions is a partial overlay, so a
// partial result is expected there and an untouched overlay keeps deferring to its role.
//
// It is idempotent over already-canonical documents, which is why every new permission adds a step
// running it again instead of extending the previous one: a document already at the previous version
// would otherwise never be completed with the new key.
const normalizeMemberPermissionsTransform: SchemaTransform<MeetRoomMemberDocument> = (roomMember) => {
	if (roomMember.customPermissions) {
		const overlay = normalizePermissions(roomMember.customPermissions);

		// Behaviour preservation, not an implication: before `meetingRead` existed, an overlay
		// overriding the join permission also decided reading, so only such an overlay gets the pin.
		// Every document this step reaches predates the independent key — later writes are stamped
		// with the current schema version and never pass through here.
		if (typeof overlay.meetingJoin === 'boolean' && overlay.meetingRead === undefined) {
			overlay.meetingRead = overlay.meetingJoin;
		}

		roomMember.customPermissions = overlay;
	}

	if (roomMember.effectivePermissions) {
		roomMember.effectivePermissions = normalizePermissions(roomMember.effectivePermissions, {
			complete: true
		}) as MeetRoomMemberPermissions;
	}

	return roomMember;
};

/**
 * Schema migrations for MeetRoomMember.
 * Key format: schema_{collection}_v{from}_to_v{to}
 */
export const roomMemberMigrations: SchemaMigrationMap<MeetRoomMemberDocument> = new Map([
	[roomMemberMigrationV1ToV2Name, normalizeMemberPermissionsTransform],
	[roomMemberMigrationV2ToV3Name, normalizeMemberPermissionsTransform]
]);
