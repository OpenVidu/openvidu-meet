import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import {
	MeetingEndAction,
	MeetRecordingEncodingPreset,
	MeetRecordingLayout,
	MeetRoomStatus
} from '@openvidu-meet/typings';
import { container } from '../../../../src/config/dependency-injector.config.js';
import { INTERNAL_CONFIG } from '../../../../src/config/internal-config.js';
import { MEET_ENV } from '../../../../src/environment.js';
import { roomMigrations } from '../../../../src/migrations/room-migrations.js';
import { generateSchemaMigrationName } from '../../../../src/models/migration.model.js';
import {
	meetRoomCollectionName,
	MeetRoomDocument,
	MeetRoomModel
} from '../../../../src/models/mongoose-schemas/room.schema.js';
import { MigrationService } from '../../../../src/services/migration.service.js';
import { startTestServer } from '../../../helpers/request-helpers.js';

// Legacy document builders used by integration tests.
// When ROOM_SCHEMA_VERSION increases, add one builder per legacy version that
// must still be migrated to the current one.

const buildLegacyRoomBase = (roomId: string) => ({
	roomId,
	roomName: 'Room',
	creationDate: Date.now(),
	status: MeetRoomStatus.OPEN,
	meetingEndAction: MeetingEndAction.NONE
});

const buildLegacyRoomV1 = (roomId: string) => ({
	schemaVersion: 1,
	...buildLegacyRoomBase(roomId),
	config: {
		chat: { enabled: true },
		recording: {
			enabled: true,
			allowAccessTo: 'admin_moderator_speaker'
		},
		virtualBackground: { enabled: true },
		e2ee: { enabled: false }
	},
	moderatorUrl: `/room/${roomId}?secret=123456`,
	speakerUrl: `/room/${roomId}?secret=abcdef`
});

const buildLegacyRoomV2 = (roomId: string) => ({
	schemaVersion: 2,
	...buildLegacyRoomBase(roomId),
	config: {
		chat: { enabled: true },
		recording: {
			enabled: true,
			layout: MeetRecordingLayout.GRID,
			encoding: MeetRecordingEncodingPreset.H264_720P_30,
			allowAccessTo: 'admin_moderator_speaker'
		},
		virtualBackground: { enabled: true },
		e2ee: { enabled: false },
		captions: { enabled: true }
	},
	moderatorUrl: `/room/${roomId}?secret=123456`,
	speakerUrl: `/room/${roomId}?secret=abcdef`
});

// v3 stored role permissions under the legacy `can*` keys; v3→v4 renames them to the canonical
// moduleAbility scheme (and splits canRetrieveRecordings into list/play/download).
const buildLegacyRoomV3 = (roomId: string) => ({
	schemaVersion: 3,
	...buildLegacyRoomBase(roomId),
	owner: MEET_ENV.INITIAL_ADMIN_USER,
	config: {
		chat: { enabled: true },
		recording: {
			enabled: true,
			layout: MeetRecordingLayout.GRID,
			encoding: MeetRecordingEncodingPreset.H264_720P_30
		},
		virtualBackground: { enabled: true },
		e2ee: { enabled: false },
		captions: { enabled: true }
	},
	roles: {
		moderator: {
			permissions: {
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
			}
		},
		speaker: {
			permissions: {
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
			}
		}
	},
	access: {
		anonymous: {
			moderator: { enabled: true, url: `/room/${roomId}?secret=123456` },
			speaker: { enabled: true, url: `/room/${roomId}?secret=abcdef` },
			recording: { enabled: true, url: `/room/${roomId}/recordings?secret=fedcba` }
		},
		user: { enabled: false, url: `/room/${roomId}` }
	},
	rolesUpdatedAt: Date.now()
});

// Canonical permission sets every legacy room must end up with after the chain reaches the current
// version (they descend from the v2→v3 defaults, renamed by v3→v4).
const expectedCanonicalModeratorPermissions = {
	recordingControl: true,
	recordingList: true,
	recordingPlay: true,
	recordingDownload: true,
	recordingDelete: true,
	meetingJoin: true,
	roomShareAccessLinks: true,
	participantPromote: true,
	participantKick: true,
	meetingEnd: true,
	mediaPublishVideo: true,
	mediaPublishAudio: true,
	mediaShareScreen: true,
	chatRead: true,
	chatWrite: true,
	mediaChangeVirtualBackground: true
};

const expectedCanonicalSpeakerPermissions = {
	recordingControl: false,
	recordingList: true,
	recordingPlay: true,
	recordingDownload: true,
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

/**
 * Single assertion function for migrated room documents in integration tests.
 * This ensures all fields are validated consistently across test cases, and serves
 * as a single source of truth for the expected final state of any migrated room
 * document (regardless of the original version).
 * Keep this aligned with the CURRENT room schema (not intermediate versions).
 */
const expectMigratedRoomToCurrentVersion = (migratedRoom: Record<string, unknown>, roomId: string) => {
	expect(migratedRoom).toMatchObject({
		schemaVersion: INTERNAL_CONFIG.ROOM_SCHEMA_VERSION,
		roomId,
		roomName: 'Room',
		owner: MEET_ENV.INITIAL_ADMIN_USER,
		creationDate: expect.any(Number),
		config: {
			chat: { enabled: true },
			recording: {
				enabled: true,
				layout: MeetRecordingLayout.GRID,
				encoding: MeetRecordingEncodingPreset.H264_720P_30
			},
			virtualBackground: { enabled: true },
			e2ee: { enabled: false },
			captions: {
				enabled: true
			}
		},
		roles: {
			moderator: {
				permissions: expectedCanonicalModeratorPermissions
			},
			speaker: {
				permissions: expectedCanonicalSpeakerPermissions
			}
		},
		access: {
			anonymous: {
				moderator: {
					enabled: true,
					url: `/room/${roomId}?secret=123456`
				},
				speaker: {
					enabled: true,
					url: `/room/${roomId}?secret=abcdef`
				},
				recording: {
					enabled: true,
					url: expect.stringContaining(`/room/${roomId}/recordings`)
				}
			},
			user: {
				enabled: false,
				url: `/room/${roomId}`
			}
		},
		rolesUpdatedAt: expect.any(Number),
		status: MeetRoomStatus.OPEN,
		meetingEndAction: MeetingEndAction.NONE
	});

	expect(migratedRoom).not.toHaveProperty('moderatorUrl');
	expect(migratedRoom).not.toHaveProperty('speakerUrl');
	expect(migratedRoom).not.toHaveProperty('config.recording.allowAccessTo');
	// The rename must leave no legacy `can*` key behind in either role.
	expect(migratedRoom).not.toHaveProperty('roles.moderator.permissions.canRecord');
	expect(migratedRoom).not.toHaveProperty('roles.moderator.permissions.canRetrieveRecordings');
	expect(migratedRoom).not.toHaveProperty('roles.speaker.permissions.canRecord');
	expect(migratedRoom).not.toHaveProperty('roles.speaker.permissions.canRetrieveRecordings');
};

describe('Room Schema Migrations', () => {
	/**
	 * Unit tests validate each transform independently.
	 * Add one test per room transform function.
	 */
	describe('Room Migration Transforms', () => {
		it('should transform room schema from v1 to v2', () => {
			const migrationName = generateSchemaMigrationName(meetRoomCollectionName, 1, 2);
			const transform = roomMigrations.get(migrationName);
			expect(transform).toBeDefined();

			const roomV1 = {
				schemaVersion: 1,
				roomId: 'room-v1',
				roomName: 'Room V1',
				creationDate: Date.now(),
				config: {
					chat: { enabled: true },
					recording: {
						enabled: true,
						allowAccessTo: 'admin_moderator_speaker'
					},
					virtualBackground: { enabled: true },
					e2ee: { enabled: false }
				},
				moderatorUrl: '/room/room-v1?secret=123456',
				speakerUrl: '/room/room-v1?secret=abcdef',
				status: MeetRoomStatus.OPEN,
				meetingEndAction: MeetingEndAction.NONE
			} as unknown as MeetRoomDocument;

			const migratedRoom = transform!(roomV1);
			expect(migratedRoom).toMatchObject({
				roomId: 'room-v1',
				roomName: 'Room V1',
				creationDate: expect.any(Number),
				config: {
					chat: { enabled: true },
					recording: {
						enabled: true,
						allowAccessTo: 'admin_moderator_speaker',
						layout: MeetRecordingLayout.GRID,
						encoding: MeetRecordingEncodingPreset.H264_720P_30
					},
					virtualBackground: { enabled: true },
					e2ee: { enabled: false },
					captions: { enabled: true }
				},
				moderatorUrl: '/room/room-v1?secret=123456',
				speakerUrl: '/room/room-v1?secret=abcdef',
				status: MeetRoomStatus.OPEN,
				meetingEndAction: MeetingEndAction.NONE
			});
		});

		it('should transform room schema from v2 to v3', () => {
			const migrationName = generateSchemaMigrationName(meetRoomCollectionName, 2, 3);
			const transform = roomMigrations.get(migrationName);
			expect(transform).toBeDefined();

			const roomV2 = {
				schemaVersion: 2,
				roomId: 'room-v2',
				roomName: 'Room V2',
				creationDate: Date.now(),
				config: {
					chat: { enabled: true },
					recording: {
						enabled: true,
						layout: MeetRecordingLayout.GRID,
						encoding: MeetRecordingEncodingPreset.H264_720P_30,
						allowAccessTo: 'admin_moderator_speaker'
					},
					virtualBackground: { enabled: true },
					e2ee: { enabled: false },
					captions: { enabled: true }
				},
				moderatorUrl: '/room/room-v2?secret=123456',
				speakerUrl: '/room/room-v2?secret=abcdef',
				status: MeetRoomStatus.OPEN,
				meetingEndAction: MeetingEndAction.NONE
			} as unknown as MeetRoomDocument;

			const migratedRoom = transform!(roomV2);
			expect(migratedRoom).toMatchObject({
				roomId: 'room-v2',
				roomName: 'Room V2',
				owner: MEET_ENV.INITIAL_ADMIN_USER,
				creationDate: expect.any(Number),
				config: {
					chat: { enabled: true },
					recording: {
						enabled: true,
						layout: MeetRecordingLayout.GRID,
						encoding: MeetRecordingEncodingPreset.H264_720P_30
					},
					virtualBackground: { enabled: true },
					e2ee: { enabled: false },
					captions: { enabled: true }
				},
				roles: {
					moderator: {
						permissions: {
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
						}
					},
					speaker: {
						permissions: {
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
						}
					}
				},
				access: {
					anonymous: {
						moderator: {
							enabled: true,
							url: '/room/room-v2?secret=123456'
						},
						speaker: {
							enabled: true,
							url: '/room/room-v2?secret=abcdef'
						},
						recording: {
							enabled: true,
							url: expect.stringContaining('/room/room-v2/recordings')
						}
					},
					user: {
						enabled: false,
						url: '/room/room-v2'
					}
				},
				rolesUpdatedAt: expect.any(Number),
				status: MeetRoomStatus.OPEN,
				meetingEndAction: MeetingEndAction.NONE
			});
			expect(migratedRoom).not.toHaveProperty('moderatorUrl');
			expect(migratedRoom).not.toHaveProperty('speakerUrl');
			expect(migratedRoom).not.toHaveProperty('config.recording.allowAccessTo');
		});

		it('should transform room schema from v3 to v4 renaming permission keys to the canonical scheme', () => {
			const migrationName = generateSchemaMigrationName(meetRoomCollectionName, 3, 4);
			const transform = roomMigrations.get(migrationName);
			expect(transform).toBeDefined();

			const roomV3 = buildLegacyRoomV3('room-v3') as unknown as MeetRoomDocument;
			const migratedRoom = transform!(roomV3);

			expect(migratedRoom.roles.moderator.permissions).toEqual(expectedCanonicalModeratorPermissions);
			expect(migratedRoom.roles.speaker.permissions).toEqual(expectedCanonicalSpeakerPermissions);
		});
	});

	describe('Room Migration Integration', () => {
		let migrationService: MigrationService;
		const testRoomIds: string[] = [];

		beforeAll(async () => {
			await startTestServer();
			migrationService = container.get(MigrationService);
		});

		afterAll(async () => {
			await MeetRoomModel.collection.deleteMany({ roomId: { $in: testRoomIds } });
		});

		// Integration tests validate that any legacy version reaches the CURRENT version.
		// Keep one case per supported legacy version in this matrix.
		it.each([
			{ fromVersion: 1, buildDocument: buildLegacyRoomV1 },
			{ fromVersion: 2, buildDocument: buildLegacyRoomV2 },
			{ fromVersion: 3, buildDocument: buildLegacyRoomV3 }
		])(
			'should migrate a legacy room document from v$fromVersion to the current version',
			async ({ buildDocument }) => {
				const roomId = `legacy-room-${Date.now()}`;
				testRoomIds.push(roomId);

				await MeetRoomModel.collection.insertOne(buildDocument(roomId));
				await migrationService.runMigrations();

				const migratedRoom = await MeetRoomModel.collection.findOne({ roomId });
				expect(migratedRoom).toBeTruthy();
				expectMigratedRoomToCurrentVersion(migratedRoom as Record<string, unknown>, roomId);
			}
		);
	});
});
