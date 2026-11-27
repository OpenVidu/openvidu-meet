import type { SchemaMigrationMap } from '../models/migration.model.js';
import type { MeetChatMessageDocument } from '../models/mongoose-schemas/chat-message.schema.js';

/**
 * Schema migrations for MeetChatMessage.
 * Key format: schema_{collection}_v{from}_to_v{to}
 */
export const chatMessageMigrations: SchemaMigrationMap<MeetChatMessageDocument> = new Map([
	// [chatMessageMigrationV1ToV2Name, chatMessageMigrationV1ToV2Transform]
]);
