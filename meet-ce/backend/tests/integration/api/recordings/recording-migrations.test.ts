import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { MeetRecordingEncodingPreset, MeetRecordingLayout, MeetRecordingStatus } from '@openvidu-meet/typings';
import { container } from '../../../../src/config/dependency-injector.config.js';
import { INTERNAL_CONFIG } from '../../../../src/config/internal-config.js';
import { recordingMigrations } from '../../../../src/migrations/recording-migrations.js';
import { generateSchemaMigrationName } from '../../../../src/models/migration.model.js';
import {
	meetRecordingCollectionName,
	MeetRecordingDocument,
	MeetRecordingModel
} from '../../../../src/models/mongoose-schemas/recording.schema.js';
import { MigrationService } from '../../../../src/services/migration.service.js';
import { startTestServer } from '../../../helpers/request-helpers.js';

// Legacy document builders used by integration tests.
// When RECORDING_SCHEMA_VERSION increases, add one builder per legacy version that
// must still be migrated to the current one.

const buildLegacyRecordingV1 = (recordingId: string) => ({
	schemaVersion: 1,
	recordingId,
	roomId: 'room-123',
	roomName: 'Legacy Room',
	status: MeetRecordingStatus.COMPLETE,
	filename: `${recordingId}.mp4`,
	startDate: Date.now() - 1000,
	endDate: Date.now(),
	duration: 1000,
	size: 1024,
	accessSecrets: {
		public: 'public-secret',
		private: 'private-secret'
	}
});

/**
 * Single assertion function for migrated recording documents in integration tests.
 * This ensures all fields are validated consistently across test cases, and serves
 * as a single source of truth for the expected final state of any migrated recording
 * document (regardless of the original version).
 * Keep this aligned with the CURRENT recording schema (not intermediate versions).
 */
const expectMigratedRecordingToCurrentVersion = (migratedRecording: Record<string, unknown>, recordingId: string) => {
	expect(migratedRecording).toMatchObject({
		schemaVersion: INTERNAL_CONFIG.RECORDING_SCHEMA_VERSION,
		recordingId: recordingId,
		roomId: 'room-123',
		roomName: 'Legacy Room',
		status: MeetRecordingStatus.COMPLETE,
		filename: `${recordingId}.mp4`,
		startDate: expect.any(Number),
		endDate: expect.any(Number),
		duration: 1000,
		size: 1024,
		layout: MeetRecordingLayout.GRID,
		encoding: MeetRecordingEncodingPreset.H264_720P_30,
		accessSecrets: {
			public: 'public-secret',
			private: 'private-secret'
		}
	});
};

describe('Recording Schema Migrations', () => {
	/**
	 * Unit tests validate each transform independently.
	 * Add one test per recording transform function.
	 */
	describe('Recording Migration Transforms', () => {
		it('should transform recording schema from v1 to v2', () => {
			const migrationName = generateSchemaMigrationName(meetRecordingCollectionName, 1, 2);
			const transform = recordingMigrations.get(migrationName);
			expect(transform).toBeDefined();

			const recordingV1 = {
				schemaVersion: 1,
				recordingId: 'recording-v1',
				roomId: 'room-v1',
				roomName: 'Legacy Room',
				status: MeetRecordingStatus.COMPLETE,
				filename: 'recording-v1.mp4',
				startDate: Date.now() - 1000,
				endDate: Date.now(),
				duration: 1000,
				size: 1024,
				accessSecrets: {
					public: 'public-secret',
					private: 'private-secret'
				}
			} as unknown as MeetRecordingDocument;

			const migratedRecording = transform!(recordingV1);
			expect(migratedRecording).toMatchObject({
				recordingId: 'recording-v1',
				roomId: 'room-v1',
				roomName: 'Legacy Room',
				status: MeetRecordingStatus.COMPLETE,
				filename: 'recording-v1.mp4',
				startDate: expect.any(Number),
				endDate: expect.any(Number),
				duration: 1000,
				size: 1024,
				layout: MeetRecordingLayout.GRID,
				encoding: MeetRecordingEncodingPreset.H264_720P_30,
				accessSecrets: {
					public: 'public-secret',
					private: 'private-secret'
				}
			});
		});
	});

	describe('Recording Migration Integration', () => {
		let migrationService: MigrationService;
		const testRecordingIds: string[] = [];

		beforeAll(async () => {
			await startTestServer();
			migrationService = container.get(MigrationService);
		});

		afterAll(async () => {
			await MeetRecordingModel.collection.deleteMany({ recordingId: { $in: testRecordingIds } });
		});

		/**
		 * Integration tests validate that any legacy version reaches the CURRENT version.
		 * Keep one case per supported legacy version in this matrix.
		 */
		it.each([{ fromVersion: 1, buildDocument: buildLegacyRecordingV1 }])(
			'should migrate a legacy recording document from v$fromVersion to current version',
			async ({ buildDocument }) => {
				const recordingId = `legacy-recording-${Date.now()}`;
				testRecordingIds.push(recordingId);

				await MeetRecordingModel.collection.insertOne(buildDocument(recordingId));
				await migrationService.runMigrations();

				const migratedRecording = await MeetRecordingModel.collection.findOne({ recordingId: recordingId });
				expect(migratedRecording).toBeTruthy();
				expectMigratedRecordingToCurrentVersion(migratedRecording as Record<string, unknown>, recordingId);
			}
		);
	});
});
