import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { MeetRoomMemberPermissions, MeetRoomMemberRole, MeetRoomMemberType } from '@openvidu-meet/typings';
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

const baseEffectivePermissions: MeetRoomMemberPermissions = {
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

// Legacy document builders used by integration tests.
// When ROOM_MEMBER_SCHEMA_VERSION increases, add one builder per legacy version that
// must still be migrated to the current one.

const buildLegacyRoomMemberV1 = (memberId: string) => ({
	schemaVersion: 1,
	memberId,
	roomId: 'room-1',
	name: 'Test User',
	membershipDate: Date.now(),
	accessUrl: `/room/room-1`,
	baseRole: MeetRoomMemberRole.MODERATOR,
	effectivePermissions: baseEffectivePermissions,
	permissionsUpdatedAt: Date.now()
});

/**
 * Single assertion function for migrated room member documents in integration tests.
 * Keep this aligned with the CURRENT room member schema (not intermediate versions).
 */
const expectMigratedRoomMemberToCurrentVersion = (migratedMember: Record<string, unknown>, memberId: string) => {
	expect(migratedMember).toMatchObject({
		schemaVersion: INTERNAL_CONFIG.ROOM_MEMBER_SCHEMA_VERSION,
		memberId,
		roomId: 'room-1',
		type: MeetRoomMemberType.REGISTERED,
		name: 'Test User',
		membershipDate: expect.any(Number),
		accessUrl: '/room/room-1',
		baseRole: MeetRoomMemberRole.MODERATOR,
		effectivePermissions: expect.any(Object),
		permissionsUpdatedAt: expect.any(Number)
	});
};

describe('Room Member Schema Migrations', () => {
	/**
	 * Unit tests validate each transform independently.
	 * Add one test per room member transform function.
	 */
	describe('Room Member Migration Transforms', () => {
		it('should transform room member schema from v1 to v2', () => {
			const migrationName = generateSchemaMigrationName(meetRoomMemberCollectionName, 1, 2);
			const transform = roomMemberMigrations.get(migrationName);
			expect(transform).toBeDefined();

			const memberV1 = {
				schemaVersion: 1,
				memberId: 'alice',
				roomId: 'room-1',
				name: 'Alice',
				membershipDate: Date.now(),
				accessUrl: '/room/room-1',
				baseRole: MeetRoomMemberRole.MODERATOR,
				effectivePermissions: baseEffectivePermissions,
				permissionsUpdatedAt: Date.now()
			} as unknown as MeetRoomMemberDocument;

			const migratedMember = transform!(memberV1);
			expect(migratedMember).toMatchObject({
				memberId: 'alice',
				roomId: 'room-1',
				type: MeetRoomMemberType.REGISTERED,
				name: 'Alice',
				membershipDate: expect.any(Number),
				accessUrl: '/room/room-1',
				baseRole: MeetRoomMemberRole.MODERATOR,
				effectivePermissions: baseEffectivePermissions,
				permissionsUpdatedAt: expect.any(Number)
			});
		});
	});

	describe('Room Member Migration Integration', () => {
		let migrationService: MigrationService;
		const testMemberIds: string[] = [];

		beforeAll(async () => {
			await startTestServer();
			migrationService = container.get(MigrationService);
		});

		afterAll(async () => {
			await MeetRoomMemberModel.collection.deleteMany({ memberId: { $in: testMemberIds } });
		});

		/**
		 * Integration tests validate that any legacy version reaches the CURRENT version.
		 * Keep one case per supported legacy version (and member type) in this matrix.
		 */
		it.each([{ fromVersion: 1, buildDocument: buildLegacyRoomMemberV1 }])(
			'should migrate a legacy room member document from v$fromVersion to current version',
			async ({ buildDocument }) => {
				const memberId = `registered_member_${Date.now()}`;
				testMemberIds.push(memberId);

				await MeetRoomMemberModel.collection.insertOne(buildDocument(memberId));
				await migrationService.runMigrations();

				const migratedMember = await MeetRoomMemberModel.collection.findOne({ memberId });
				expect(migratedMember).toBeTruthy();
				expectMigratedRoomMemberToCurrentVersion(migratedMember as Record<string, unknown>, memberId);
			}
		);
	});
});
