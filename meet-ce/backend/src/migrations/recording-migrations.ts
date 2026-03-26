import { MeetRecordingEncodingPreset, MeetRecordingLayout } from '@openvidu-meet/typings';
import { MEET_ENV } from '../environment.js';
import type { SchemaMigrationMap, SchemaTransform } from '../models/migration.model.js';
import { generateSchemaMigrationName } from '../models/migration.model.js';
import type { MeetRecordingDocument } from '../models/mongoose-schemas/recording.schema.js';
import { meetRecordingCollectionName } from '../models/mongoose-schemas/recording.schema.js';

const recordingMigrationV1ToV2Name = generateSchemaMigrationName(meetRecordingCollectionName, 1, 2);
const recordingMigrationV2ToV3Name = generateSchemaMigrationName(meetRecordingCollectionName, 2, 3);

const recordingMigrationV1ToV2Transform: SchemaTransform<MeetRecordingDocument> = (recording) => {
	recording.layout = MeetRecordingLayout.GRID;
	recording.encoding = MeetRecordingEncodingPreset.H264_720P_30;
	return recording;
};

const recordingMigrationV2ToV3Transform: SchemaTransform<MeetRecordingDocument> = (recording) => {
	recording.roomOwner = MEET_ENV.INITIAL_ADMIN_USER;
	recording.roomRegisteredAccess = false;
	return recording;
};

/**
 * Schema migrations for MeetRecording.
 * Key format: schema_{collection}_v{from}_to_v{to}
 */
export const recordingMigrations: SchemaMigrationMap<MeetRecordingDocument> = new Map([
	[recordingMigrationV1ToV2Name, recordingMigrationV1ToV2Transform],
	[recordingMigrationV2ToV3Name, recordingMigrationV2ToV3Transform]
]);
