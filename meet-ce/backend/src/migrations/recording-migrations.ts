import { SchemaMigrationMap } from '../models/migration.model.js';
import { MeetRecordingDocument } from '../models/mongoose-schemas/recording.schema.js';

/**
 * Schema migrations for MeetRecording.
 * Key format: schema_{collection}_v{from}_to_v{to}
 *
 * Example:
 *
 * const recordingMigrationV1ToV2Name = generateSchemaMigrationName('MeetRecording', 1, 2);
 *
 * const recordingMigrationV1ToV2Transform: SchemaTransform<MeetRecordingDocument> = () => ({
 * 	$set: {
 * 		quality: 'standard'
 * 	}
 * });
 */
export const recordingMigrations: SchemaMigrationMap<MeetRecordingDocument> = new Map([
	// [recordingMigrationV1ToV2Name, recordingMigrationV1ToV2Transform]
]);
