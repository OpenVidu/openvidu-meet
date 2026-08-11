import type { MeetLegacyPermissionKey, MeetRoomMemberPermissions } from '@openvidu-meet/typings';
import { MeetRecordingEncodingPreset, MeetRecordingLayout, normalizePermissions } from '@openvidu-meet/typings';
import { uid as secureUid } from 'uid/secure';
import { MEET_ENV } from '../environment.js';
import type { SchemaMigrationMap, SchemaTransform } from '../models/migration.model.js';
import { generateSchemaMigrationName } from '../models/migration.model.js';
import type { MeetRoomDocument } from '../models/mongoose-schemas/room.schema.js';
import { meetRoomCollectionName } from '../models/mongoose-schemas/room.schema.js';

const roomMigrationV1ToV2Name = generateSchemaMigrationName(meetRoomCollectionName, 1, 2);
const roomMigrationV2ToV3Name = generateSchemaMigrationName(meetRoomCollectionName, 2, 3);
const roomMigrationV3ToV4Name = generateSchemaMigrationName(meetRoomCollectionName, 3, 4);

const roomMigrationV1ToV2Transform: SchemaTransform<MeetRoomDocument> = (room) => {
	room.config.captions = { enabled: true };
	room.config.recording.layout = MeetRecordingLayout.GRID;
	room.config.recording.encoding = MeetRecordingEncodingPreset.H264_720P_30;
	return room;
};

// v3 stored the role permissions under the legacy `can*` keys, so this transform keeps producing that
// historical shape (typed through MeetLegacyPermissionKey, which the current MeetRoomMemberPermissions
// no longer declares). The migration runner chains it with v3→v4 in memory, so a v1/v2 document still
// lands canonical — only the final shape is written back.
const roomMigrationV2ToV3Transform: SchemaTransform<MeetRoomDocument> = (room) => {
	const legacyRoom = room as unknown as {
		moderatorUrl?: string;
		speakerUrl?: string;
		config: {
			recording: {
				allowAccessTo?: unknown;
			};
		};
	};

	const v3ModeratorPermissions: Record<MeetLegacyPermissionKey, boolean> = {
		canRecord: true,
		canRetrieveRecordings: true,
		canDeleteRecordings: true,
		canJoinMeeting: true,
		canShareAccessLinks: true,
		canMakeModerator: true,
		canKickParticipants: true,
		canEndMeeting: true,
		canPublishVideo: true,
		canPublishAudio: true,
		canShareScreen: true,
		canReadChat: true,
		canWriteChat: true,
		canChangeVirtualBackground: true
	};
	const v3SpeakerPermissions: Record<MeetLegacyPermissionKey, boolean> = {
		canRecord: false,
		canRetrieveRecordings: true,
		canDeleteRecordings: false,
		canJoinMeeting: true,
		canShareAccessLinks: false,
		canMakeModerator: false,
		canKickParticipants: false,
		canEndMeeting: false,
		canPublishVideo: true,
		canPublishAudio: true,
		canShareScreen: true,
		canReadChat: true,
		canWriteChat: true,
		canChangeVirtualBackground: true
	};

	room.owner = MEET_ENV.INITIAL_ADMIN_USER;
	room.roles = {
		moderator: { permissions: v3ModeratorPermissions },
		speaker: { permissions: v3SpeakerPermissions }
	} as unknown as MeetRoomDocument['roles'];
	room.access = {
		anonymous: {
			moderator: {
				enabled: true,
				url: legacyRoom.moderatorUrl!
			},
			speaker: {
				enabled: true,
				url: legacyRoom.speakerUrl!
			},
			recording: {
				enabled: true,
				url: `/room/${room.roomId}/recordings?secret=${secureUid(10)}`
			}
		},
		user: {
			enabled: false,
			url: `/room/${room.roomId}`
		}
	};
	room.rolesUpdatedAt = Date.now();

	delete legacyRoom.moderatorUrl;
	delete legacyRoom.speakerUrl;
	delete legacyRoom.config.recording.allowAccessTo;

	return room;
};

// v3→v4: rename the role permission keys from the legacy `can*` spellings to the canonical
// moduleAbility scheme, deriving the mapping from MEET_PERMISSION_ALIASES via normalizePermissions()
// (which also splits canRetrieveRecordings into recordingList/recordingPlay/recordingDownload,
// granting the whole group whatever the old flag granted). Without this rename the canonical Mongoose
// schema would silently drop every stored permission on the next write (see B1 in the migration plan).
const roomMigrationV3ToV4Transform: SchemaTransform<MeetRoomDocument> = (room) => {
	for (const role of ['moderator', 'speaker'] as const) {
		const roleConfig = room.roles?.[role];

		if (roleConfig?.permissions) {
			roleConfig.permissions = normalizePermissions(roleConfig.permissions) as MeetRoomMemberPermissions;
		}
	}

	return room;
};

/**
 * Schema migrations for MeetRoom.
 * Key format: schema_{collection}_v{from}_to_v{to}
 */
export const roomMigrations: SchemaMigrationMap<MeetRoomDocument> = new Map([
	[roomMigrationV1ToV2Name, roomMigrationV1ToV2Transform],
	[roomMigrationV2ToV3Name, roomMigrationV2ToV3Transform],
	[roomMigrationV3ToV4Name, roomMigrationV3ToV4Transform]
]);
