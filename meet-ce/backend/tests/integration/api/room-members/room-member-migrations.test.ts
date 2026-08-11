import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { MeetRoomMemberRole, MeetRoomMemberType } from '@openvidu-meet/typings';
import { container } from '../../../../src/config/dependency-injector.config.js';
import { INTERNAL_CONFIG } from '../../../../src/config/internal-config.js';
import { roomMemberMigrations } from '../../../../src/migrations/room-member-migrations.js';
import { generateSchemaMigrationName } from '../../../../src/models/migration.model.js';
import {
	meetRoomMemberCollectionName,
	MeetRoomMemberDocument,
	MeetRoomMemberModel
} from '../../../../src/models/mongoose-schemas/room-member.schema.js';
import { MigrationService } from '../../../../src/services/migration.service.js';
import { startTestServer } from '../../../helpers/request-helpers.js';

// v1 stored permissions under the legacy `can*` keys; v1→v2 renames them to the canonical
// moduleAbility scheme (splitting canRetrieveRecordings into list/play/download). Without the
// rename, the canonical Mongoose schema would drop every stored key and the required
// effectivePermissions would come back empty (silent permission loss).
const buildLegacyRoomMemberV1 = (roomId: string, memberId: string) => ({
	schemaVersion: 1,
	memberId,
	roomId,
	type: MeetRoomMemberType.IDENTIFIED_GUEST,
	name: 'Legacy Member',
	membershipDate: Date.now(),
	accessUrl: `/room/${roomId}?secret=${memberId}`,
	baseRole: MeetRoomMemberRole.SPEAKER,
	customPermissions: {
		canRecord: true,
		canRetrieveRecordings: false
	},
	effectivePermissions: {
		canRecord: true,
		canRetrieveRecordings: false,
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
	},
	permissionsUpdatedAt: Date.now()
});

const expectedCanonicalEffectivePermissions = {
	recordingControl: true,
	recordingList: false,
	recordingPlay: false,
	recordingDownload: false,
	recordingDelete: false,
	meetingJoin: true,
	roomShareAccessLinks: false,
	participantPromote: false,
	participantKick: false,
	meetingEnd: false,
	mediaPublishVideo: true,
	mediaPublishAudio: true,
	mediaShareScreen: true,
	chatRead: true,
	chatWrite: true,
	mediaChangeVirtualBackground: true
};

// The partial custom overlay stays partial: the legacy flags rename (and the retrieval flag expands
// to its whole group), but no key the member never overrode is invented.
const expectedCanonicalCustomPermissions = {
	recordingControl: true,
	recordingList: false,
	recordingPlay: false,
	recordingDownload: false
};

describe('Room Member Schema Migrations', () => {
	describe('Room Member Migration Transforms', () => {
		it('should transform room member schema from v1 to v2 renaming permission keys to the canonical scheme', () => {
			const migrationName = generateSchemaMigrationName(meetRoomMemberCollectionName, 1, 2);
			const transform = roomMemberMigrations.get(migrationName);
			expect(transform).toBeDefined();

			const memberV1 = buildLegacyRoomMemberV1('room-v1', 'member-v1') as unknown as MeetRoomMemberDocument;
			const migratedMember = transform!(memberV1);

			expect(migratedMember.effectivePermissions).toEqual(expectedCanonicalEffectivePermissions);
			expect(migratedMember.customPermissions).toEqual(expectedCanonicalCustomPermissions);
		});

		it('should leave an absent customPermissions untouched', () => {
			const migrationName = generateSchemaMigrationName(meetRoomMemberCollectionName, 1, 2);
			const transform = roomMemberMigrations.get(migrationName);

			const memberV1 = buildLegacyRoomMemberV1('room-v1', 'member-v1') as unknown as MeetRoomMemberDocument;
			delete (memberV1 as Partial<MeetRoomMemberDocument>).customPermissions;

			const migratedMember = transform!(memberV1);
			expect(migratedMember.customPermissions).toBeUndefined();
			expect(migratedMember.effectivePermissions).toEqual(expectedCanonicalEffectivePermissions);
		});
	});

	describe('Room Member Migration Integration', () => {
		let migrationService: MigrationService;
		const testRoomIds: string[] = [];

		beforeAll(async () => {
			await startTestServer();
			migrationService = container.get(MigrationService);
		});

		afterAll(async () => {
			await MeetRoomMemberModel.collection.deleteMany({ roomId: { $in: testRoomIds } });
		});

		it('should migrate a legacy room member document from v1 to the current version', async () => {
			const roomId = `legacy-member-room-${Date.now()}`;
			const memberId = `legacy-member-${Date.now()}`;
			testRoomIds.push(roomId);

			await MeetRoomMemberModel.collection.insertOne(buildLegacyRoomMemberV1(roomId, memberId));
			await migrationService.runMigrations();

			const migratedMember = await MeetRoomMemberModel.collection.findOne({ roomId, memberId });
			expect(migratedMember).toBeTruthy();
			expect(migratedMember).toMatchObject({
				schemaVersion: INTERNAL_CONFIG.ROOM_MEMBER_SCHEMA_VERSION,
				memberId,
				roomId,
				baseRole: MeetRoomMemberRole.SPEAKER,
				effectivePermissions: expectedCanonicalEffectivePermissions,
				customPermissions: expectedCanonicalCustomPermissions
			});
			expect(migratedMember).not.toHaveProperty('effectivePermissions.canRecord');
			expect(migratedMember).not.toHaveProperty('effectivePermissions.canRetrieveRecordings');
			expect(migratedMember).not.toHaveProperty('customPermissions.canRecord');
		});
	});
});
