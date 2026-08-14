# MongoDB Schema Migration System

This document explains the schema migration system implemented for OpenVidu Meet's MongoDB collections.

---

## Overview

The schema migration system enables safe evolution of MongoDB document structures over time. It handles scenarios like:

- Adding new required fields with default values
- Removing deprecated fields
- Renaming fields
- Restructuring nested objects
- Data type transformations

### Core Features

- ✅ **Forward-only migrations** (v1 → v2 → v3)
- ✅ **Automatic execution at startup** (before accepting requests)
- ✅ **HA-safe** (distributed locking prevents concurrent migrations)
- ✅ **Batch processing** (efficient handling of large collections)
- ✅ **Progress tracking** (migrations stored in `MeetMigration` collection)

---

## Architecture

### Schema Version Field

Each document includes a `schemaVersion` field:

```typescript
{
  schemaVersion: 1,  // Current version (starts at 1)
  roomId: "room-123",
  roomName: "My Room",
  // ... other fields
}
```

**Important**: `schemaVersion` is **internal only** and stripped from API responses via Mongoose schema transforms.

### Migration Components

```
src/
├── migrations/
│   ├── migration-registry.ts        # Central registry of all collections
│   ├── room-migrations.ts           # Room-specific migrations
│   ├── recording-migrations.ts      # Recording-specific migrations
│   ├── user-migrations.ts           # User-specific migrations
│   ├── api-key-migrations.ts        # API key-specific migrations
│   ├── global-config-migrations.ts  # Global config-specific migrations
│   ├── webhooks-migration.ts        # Webhook-specific data migration (see below)
│   └── index.ts                     # Exports
└── models/
    └── migration.model.ts           # Migration types and interfaces
```

---

## Two categories of migration

Both are forward-only, run at startup under the same distributed lock, and are tracked in the
`MeetMigration` collection, so one query answers "which migrations has this deployment run".
They differ in what they can express and in how they are invoked.

| | **Schema migration** | **Data migration** |
| --- | --- | --- |
| Name | `schema_{collection}_v{from}_to_v{to}` | `data_{description}` |
| Shape | pure `SchemaTransform`: `(doc) => doc` | arbitrary async step, may use services |
| Scope | one document, one collection | may move data across collections |
| Invoked by | the registry, driven by `schemaVersion` | `MigrationService.runMigrations()`, by name |
| Repeats? | guarded by the document's `schemaVersion` | guarded by the state it consumes |

Everything below this section describes **schema** migrations, which is what nearly every change
needs. Reach for a data migration only when the per-document transform contract cannot express the
change — currently the only one is `WebhookMigration` in `webhooks-migration.ts`
(`data_legacy_webhook_config_to_collection`), which moves the legacy global-config webhook URL into
the webhook collection, and must therefore run *before* the schema migration that drops that field.

Because it needs the container (repositories, the webhook service), a data migration is an
`@injectable()` class rather than a pure function — the only thing in this folder that is. It does
**not** take its own lock: `MigrationService.runMigrations()` calls it by name, first, from inside
the single lock that also covers the schema migrations, so ordering is guaranteed by call order
rather than by comment.

When adding one:

1. Declare its name next to `LEGACY_WEBHOOK_CONFIG_MIGRATION_NAME` in `models/migration.model.ts`
   (the `data_` prefix is enforced by the `MeetMigration` schema validator).
2. Bind the class in `dependency-injector.config.ts`, inject it into `MigrationService`, and call it
   from `runMigrations()` in the position its ordering constraint requires.
3. Wrap the work in `markAsStarted` / `markAsCompleted` / `markAsFailed` from `MigrationRepository`,
   recording in `metadata` whatever an operator would need to audit the run afterwards.
4. Gate on the real data state, not on the tracking record: as in `executeMigrationChainForVersion`,
   a deployment with nothing to migrate must not be recorded, and a record disagreeing with the data
   is a warning plus a re-run, never a silent skip.

---

## Adding New Migrations

### Step 1: Update TypeScript Interface

Update one of the TypeScript interfaces located in `typings/src/database` to reflect the new schema changes. For example, if adding a new field to the `MeetRoom` entity:

```typescript
// typings/src/database/room.entity.ts
export interface MeetRoom extends MeetRoomOptions {
	roomId: string;
	// ... existing fields ...
	maxParticipants: number; // New field
}
```

### Step 2: Update Schema Version in Configuration

In `src/config/internal-config.ts`, increment the version constant and update the `MIGRATION_REV` timestamp comment on the same line:

```typescript
// internal-config.ts
export const INTERNAL_CONFIG = {
	// ... other config
	ROOM_SCHEMA_VERSION: 2 as SchemaVersion // MIGRATION_REV: 1771328577054
	// ...
};
```

`MIGRATION_REV` is a unique marker (current timestamp in milliseconds) used to make concurrent schema-version bumps more visible during Git merges.

If a merge conflict appears in that line, it means multiple migrations were created in parallel; resolve it by:

1. Keeping all migration code changes.
2. Re-evaluating the final schema version number.
3. Updating `MIGRATION_REV` again with a new timestamp.

### Step 3: Update Moongose Schema

Update the Mongoose schema to reflect the changes (new fields, etc.):

```typescript
// models/mongoose-schemas/room.schema.ts
const MeetRoomSchema = new Schema<MeetRoomDocument>({
	// ... existing fields ...
	maxParticipants: { type: Number, required: true, default: 100 } // New field
});
```

### Step 4: Create Migration Definition

Create a migration function that transforms documents from the old schema version to the new one. This function will be registered in the migration map.

```typescript
import { SchemaTransform, generateSchemaMigrationName } from '../models/migration.model.js';
import { meetRoomCollectionName, MeetRoomDocument } from '../models/mongoose-schemas/room.schema.js';

const roomMigrationV1ToV2Name = generateSchemaMigrationName(meetRoomCollectionName, 1, 2);

const roomMigrationV1ToV2Transform: SchemaTransform<MeetRoomDocument> = (room) => {
	room.maxParticipants = 100;
	return room;
};
```

`transform` must return the updated document instance.
It can mutate the received document by adding, removing, or modifying fields as needed to conform to the new schema version.

### Step 5: Register Migration

Add the migration to the collection's migration map:

```typescript
export const roomMigrations: SchemaMigrationMap<MeetRoomDocument> = new Map([
	[roomMigrationV1ToV2Name, roomMigrationV1ToV2Transform]
]);
```

### Step 6: Test Migration

1. Start application - migration runs automatically
2. Check logs for migration execution
3. Verify documents in MongoDB have correct version
4. Test API to ensure new field appears correctly

### Step 7: Update Migration Tests

Every schema migration must be covered by both unit and integration tests:

1. **Unit tests (one per transform function)**
    - Add/update a unit test for each migration transform (e.g., `v2 -> v3`).
    - Validate only that transform logic in isolation (no DB startup required).

2. **Integration tests (legacy -> current version)**
    - Add/update one integration test case per supported legacy schema version.
    - Insert legacy documents directly in MongoDB, run `runMigrations()`, and assert final document shape matches the **current** schema version.
    - Do not assert intermediate schema states in integration tests.

3. **When current version increases**
    - Keep previous legacy version cases and add the new required ones.
    - Update shared final-state assertions/helpers to the new current schema.

---

## Migration Tracking

Each migration is tracked in the `MeetMigration` collection:

```json
{
	"name": "schema_room_v1_to_v2",
	"status": "completed",
	"startedAt": 1700000000000,
	"completedAt": 1700000123000,
	"metadata": {
		"collectionName": "MeetRoom",
		"fromVersion": 1,
		"toVersion": 2,
		"chainLength": 1,
		"chainStepNames": ["schema_room_v1_to_v2"],
		"migratedCount": 1523,
		"failedCount": 0,
		"pendingBefore": 1523,
		"pendingAfter": 0,
		"durationMs": 123000
	}
}
```
