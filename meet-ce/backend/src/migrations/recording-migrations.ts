import { ISchemaMigration } from '../models/migration.model.js';
import { MeetRecordingDocument } from '../models/mongoose-schemas/index.js';

/**
 * All migrations for the MeetRecording collection in chronological order.
 * Add new migrations to this array as the schema evolves.
 *
 * Example migration (when needed in the future):
 *
 * class RecordingMigrationV1ToV2 extends BaseSchemaMigration<MeetRecordingDocument> {
 *   fromVersion = 1;
 *   toVersion = 2;
 *   description = 'Add new optional field "quality" for recording quality tracking';
 *
 *   protected async transform(document: MeetRecordingDocument): Promise<Partial<MeetRecordingDocument>> {
 *     return {
 *       quality: 'standard' // Default quality for existing recordings
 *     };
 *   }
 * }
 */
export const recordingMigrations: ISchemaMigration<MeetRecordingDocument>[] = [
	// Migrations will be added here as the schema evolves
];
