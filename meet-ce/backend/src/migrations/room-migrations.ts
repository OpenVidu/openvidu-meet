import { MeetRecordingEncodingPreset, MeetRecordingLayout } from '@openvidu-meet/typings';
import { generateSchemaMigrationName, SchemaMigrationMap, SchemaTransform } from '../models/migration.model.js';
import { meetRoomCollectionName, MeetRoomDocument } from '../models/mongoose-schemas/room.schema.js';

const roomMigrationV1ToV2Name = generateSchemaMigrationName(meetRoomCollectionName, 1, 2);
const roomMigrationV1ToV2Transform: SchemaTransform<MeetRoomDocument> = () => ({
	$set: {
		'config.captions': { enabled: true },
		'config.recording.layout': MeetRecordingLayout.GRID,
		'config.recording.encoding': MeetRecordingEncodingPreset.H264_720P_30
	}
});

/**
 * Schema migrations for MeetRoom.
 * Key format: schema_{collection}_v{from}_to_v{to}
 */
export const roomMigrations: SchemaMigrationMap<MeetRoomDocument> = new Map([
	[roomMigrationV1ToV2Name, roomMigrationV1ToV2Transform]
]);
