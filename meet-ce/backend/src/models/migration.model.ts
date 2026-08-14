import type { Model } from 'mongoose';

/**
 * Interface representing a migration document in MongoDB.
 */
export interface MeetMigration {
	/**
	 * Unique identifier for the migration (e.g., 'schema_room_v1_to_v2',
	 * 'data_legacy_webhook_config_to_collection').
	 */
	name: MigrationName;
	/**
	 * Current status of the migration.
	 */
	status: MigrationStatus;
	/**
	 * Timestamp when the migration started.
	 */
	startedAt: number;
	/**
	 * Timestamp when the migration completed (success or failure).
	 */
	completedAt?: number;
	/**
	 * Error message if the migration failed.
	 */
	error?: string;
	/**
	 * Optional metadata about the migration execution.
	 * Can include statistics like number of items migrated, duration, etc.
	 */
	metadata?: Record<string, unknown>;
}

/**
 * Status of a migration execution.
 */
export enum MigrationStatus {
	/**
	 * Migration is currently running.
	 */
	RUNNING = 'running',
	/**
	 * Migration completed successfully.
	 */
	COMPLETED = 'completed',
	/**
	 * Migration failed with an error.
	 */
	FAILED = 'failed'
}

/**
 * Schema migrations follow the pattern: schema_{collection}_v{from}_to_v{to}
 * Example: 'schema_room_v1_to_v2', 'schema_recording_v2_to_v3'
 */
export type SchemaMigrationName = `schema_${string}_v${number}_to_v${number}`;

/**
 * Data migrations follow the pattern: data_{description}
 * Example: 'data_legacy_webhook_config_to_collection'
 *
 * They cover the one-shot upgrade steps a `SchemaTransform` cannot express, and are invoked
 * explicitly at startup instead of through the registry.
 */
export type DataMigrationName = `data_${string}`;

export type MigrationName = SchemaMigrationName | DataMigrationName;

/** @see WebhookMigration in migrations/webhooks-migration.ts */
export const LEGACY_WEBHOOK_CONFIG_MIGRATION_NAME: DataMigrationName = 'data_legacy_webhook_config_to_collection';

/**
 * Generates a migration name for schema version upgrades.
 *
 * @param collectionName - Name of the collection (e.g., 'MeetRoom', 'MeetRecording')
 * @param fromVersion - Source schema version
 * @param toVersion - Target schema version
 * @returns Migration name string
 *
 * @example
 * generateSchemaMigrationName('MeetRoom', 1, 2) // Returns: 'schema_room_v1_to_v2'
 */
export function generateSchemaMigrationName(
	collectionName: string,
	fromVersion: number,
	toVersion: number
): SchemaMigrationName {
	// Convert collection name to lowercase and remove 'Meet' prefix
	const simpleName = collectionName.replace(/^Meet/, '').toLowerCase();
	return `schema_${simpleName}_v${fromVersion}_to_v${toVersion}`;
}

/**
 * Checks whether a string matches the schema migration naming convention.
 */
export function isSchemaMigrationName(name: string): name is SchemaMigrationName {
	return /^schema_[a-z0-9_]+_v\d+_to_v\d+$/.test(name);
}

/**
 * Checks whether a string matches the data migration naming convention.
 */
export function isDataMigrationName(name: string): name is DataMigrationName {
	return /^data_[a-z0-9_]+$/.test(name);
}

/**
 * Checks whether a string matches either category's naming convention. A pattern match only —
 * it does not check the name against the registry or any other known-names list, so a historical
 * name is still valid once its schema version chain no longer exists in the current registry.
 */
export function isValidMigrationNameFormat(name: string): name is MigrationName {
	return isSchemaMigrationName(name) || isDataMigrationName(name);
}

/**
 * Parses a schema migration name and extracts entity and versions.
 */
export function parseSchemaMigrationName(
	name: string
): { collectionName: string; fromVersion: SchemaVersion; toVersion: SchemaVersion } | null {
	const match = /^schema_([a-z0-9_]+)_v(\d+)_to_v(\d+)$/.exec(name);

	if (!match) {
		return null;
	}

	return {
		collectionName: match[1],
		fromVersion: Number(match[2]),
		toVersion: Number(match[3])
	};
}

/**
 * Represents a schema version number.
 * Versions start at 1 and increment sequentially.
 */
export type SchemaVersion = number;

/**
 * Base document shape required for schema migrations.
 */
export interface SchemaMigratableDocument {
	/** Schema version for migration tracking (internal use only) */
	schemaVersion: SchemaVersion;
}

/**
 * Function that transforms a document and returns the updated document.
 */
export type SchemaTransform<TDocument extends SchemaMigratableDocument> = (document: TDocument) => TDocument;

/**
 * Map of schema migration names to transform functions.
 */
export type SchemaMigrationMap<TDocument extends SchemaMigratableDocument> = Map<
	SchemaMigrationName,
	SchemaTransform<TDocument>
>;

/**
 * Resolved migration step ready to be executed.
 */
export interface SchemaMigrationStep<TDocument extends SchemaMigratableDocument> {
	name: SchemaMigrationName;
	fromVersion: SchemaVersion;
	toVersion: SchemaVersion;
	transform: SchemaTransform<TDocument>;
}

/**
 * Registry entry for a collection's migrations.
 * Groups all migrations for a specific collection.
 */
export interface CollectionMigrationRegistry<TDocument extends SchemaMigratableDocument> {
	/** Name of the collection */
	collectionName: string;
	/** Mongoose model for the collection */
	model: Model<TDocument>;
	/** Current schema version expected by the application */
	currentVersion: SchemaVersion;
	/** Map of migration names to their transform functions */
	migrations: SchemaMigrationMap<TDocument>;
}

/**
 * Result of executing a migration.
 * Provides statistics about the migration execution.
 */
export interface MigrationResult {
	/** Number of documents successfully migrated */
	migratedCount: number;
	/** Number of documents that failed migration */
	failedCount: number;
	/** Total time taken in milliseconds */
	durationMs: number;
}
