import { MeetRecordingEncodingPreset, MeetRecordingLayout } from '@openvidu-meet/typings';
import { generateSchemaMigrationName, SchemaMigrationMap, SchemaTransform } from '../models/migration.model.js';
import { meetRecordingCollectionName, MeetRecordingDocument } from '../models/mongoose-schemas/recording.schema.js';

const recordingMigrationV1ToV2Name = generateSchemaMigrationName(meetRecordingCollectionName, 1, 2);

const recordingMigrationV1ToV2Transform: SchemaTransform<MeetRecordingDocument> = (recording) => {
	recording.layout = MeetRecordingLayout.GRID;
	recording.encoding = MeetRecordingEncodingPreset.H264_720P_30;
	return recording;
};

/**
 * Schema migrations for MeetRecording.
 * Key format: schema_{collection}_v{from}_to_v{to}
 */
export const recordingMigrations: SchemaMigrationMap<MeetRecordingDocument> = new Map([
	[recordingMigrationV1ToV2Name, recordingMigrationV1ToV2Transform]
]);
