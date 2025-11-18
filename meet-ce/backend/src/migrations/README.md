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
- ✅ **Version validation** (optional runtime checks in repositories)

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
│   ├── base-migration.ts            # Base class for migrations
│   ├── migration-registry.ts        # Central registry of all collections
│   ├── room-migrations.ts           # Room-specific migrations
│   ├── recording-migrations.ts      # Recording-specific migrations
│   ├── user-migrations.ts           # User-specific migrations
│   ├── api-key-migrations.ts        # API key-specific migrations
│   ├── global-config-migrations.ts  # Global config-specific migrations
│   └── index.ts                     # Exports
└── models/
    └── migration.model.ts           # Migration types and interfaces
```

**Note**: All migration types and interfaces (`ISchemaMigration`, `MigrationContext`, `MigrationResult`, `SchemaVersion`, `CollectionMigrationRegistry`) are defined in `src/models/migration.model.ts` for better code organization.

---

## Adding New Migrations

### Step 1: Update Schema Version in Configuration

In `src/config/internal-config.ts`, increment the version constant:

```typescript
// internal-config.ts
export const INTERNAL_CONFIG = {
	// ... other config
	ROOM_SCHEMA_VERSION: 2 // Was 1
	// ...
};
```

### Step 2: Create Migration Class

```typescript
import { BaseSchemaMigration } from './base-migration.js';
import { MeetRoomDocument } from '../repositories/schemas/room.schema.js';
import { MigrationContext } from '../models/migration.model.js';
import { Model } from 'mongoose';

class RoomMigrationV1ToV2 extends BaseSchemaMigration<MeetRoomDocument> {
	fromVersion = 1;
	toVersion = 2;
	description = 'Add maxParticipants field with default value of 100';

	protected async transform(document: MeetRoomDocument): Promise<Partial<MeetRoomDocument>> {
		// Return fields to update (schemaVersion is handled automatically)
		return {
			maxParticipants: 100
		};
	}

	// Optional: Add validation before migration runs
	async validate(model: Model<MeetRoomDocument>, context: MigrationContext): Promise<boolean> {
		// Check prerequisites, data integrity, etc.
		return true;
	}
}
```

### Step 3: Register Migration

Add the migration instance to the migrations array in `room-migrations.ts`:

```typescript
import { ISchemaMigration } from '../models/migration.model.js';
import { MeetRoomDocument } from '../repositories/schemas/room.schema.js';

export const roomMigrations: ISchemaMigration<MeetRoomDocument>[] = [
	new RoomMigrationV1ToV2()
	// Future migrations will be added here
];
```

### Step 4: Update Schema Definition

Update the Mongoose schema default version in `internal-config.ts`:

```typescript
// config/internal-config.ts
export const INTERNAL_CONFIG = {
	// ... other config
	ROOM_SCHEMA_VERSION: 2 // Updated from 1
	// ...
};
```

If adding new required fields, update the Mongoose schema:

```typescript
// repositories/schemas/room.schema.ts
import { INTERNAL_CONFIG } from '../../config/internal-config.js';

const MeetRoomSchema = new Schema<MeetRoomDocument>({
	schemaVersion: {
		type: Number,
		required: true,
		default: INTERNAL_CONFIG.ROOM_SCHEMA_VERSION // Uses config value (2)
	},
	// ... existing fields ...
	maxParticipants: { type: Number, required: true, default: 100 } // New field
});
```

### Step 5: Update TypeScript Interface

Update the domain interface to include new fields:

```typescript
// typings/src/room.ts
export interface MeetRoom extends MeetRoomOptions {
	roomId: string;
	// ... existing fields ...
	maxParticipants: number; // New field
}
```

### Step 6: Test Migration

1. Start application - migration runs automatically
2. Check logs for migration execution
3. Verify documents in MongoDB have correct version
4. Test API to ensure new field appears correctly

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
		"migratedCount": 1523,
		"skippedCount": 0,
		"failedCount": 0,
		"durationMs": 123000
	}
}
```
