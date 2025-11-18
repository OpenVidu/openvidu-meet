import { Model } from 'mongoose';
import { LoggerService } from '../services/logger.service.js';

/**
 * Interface representing a migration document in MongoDB.
 */
export interface MeetMigration {
	/**
	 * Unique identifier for the migration (e.g., 'legacy_storage_to_mongodb').
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
 * Enum defining all possible migration names in the system.
 * Each migration should have a unique identifier.
 *
 * Schema migrations follow the pattern: schema_{collection}_v{from}_to_v{to}
 * Example: 'schema_room_v1_to_v2', 'schema_recording_v2_to_v3'
 */
export enum MigrationName {
	/**
	 * Migration from legacy storage (S3, ABS, GCS) to MongoDB.
	 * Includes: GlobalConfig, Users, ApiKeys, Rooms, and Recordings.
	 */
	LEGACY_STORAGE_TO_MONGODB = 'legacy_storage_to_mongodb'
}

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
export function generateSchemaMigrationName(collectionName: string, fromVersion: number, toVersion: number): string {
	// Convert collection name to lowercase and remove 'Meet' prefix
	const simpleName = collectionName.replace(/^Meet/, '').toLowerCase();
	return `schema_${simpleName}_v${fromVersion}_to_v${toVersion}`;
}

/**
 * Represents a schema version number.
 * Versions start at 1 and increment sequentially.
 */
export type SchemaVersion = number;

/**
 * Context provided to migration functions.
 * Contains utilities and services needed during migration.
 */
export interface MigrationContext {
	/** Logger service for tracking migration progress */
	logger: LoggerService;
	/** Batch size for processing documents (default: 50) */
	batchSize?: number;
}

/**
 * Result of executing a migration.
 * Provides statistics about the migration execution.
 */
export interface MigrationResult {
	/** Number of documents successfully migrated */
	migratedCount: number;
	/** Number of documents skipped (already at target version) */
	skippedCount: number;
	/** Number of documents that failed migration */
	failedCount: number;
	/** Total time taken in milliseconds */
	durationMs: number;
}

/**
 * Interface for a single schema migration handler.
 * Each migration transforms documents from one version to the next.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ISchemaMigration<TDocument = any> {
	/** The source schema version this migration upgrades from */
	fromVersion: SchemaVersion;
	/** The target schema version this migration upgrades to */
	toVersion: SchemaVersion;
	/** Short description of what this migration does */
	description: string;

	/**
	 * Executes the migration on a batch of documents.
	 * Should update documents using MongoDB bulk operations for efficiency.
	 *
	 * @param model - Mongoose model for the collection
	 * @param context - Migration context with logger and configuration
	 * @returns Migration result with statistics
	 */
	execute(model: Model<TDocument>, context: MigrationContext): Promise<MigrationResult>;

	/**
	 * Optional validation to check if migration is safe to run.
	 * Can verify prerequisites or data integrity before migration starts.
	 *
	 * @param model - Mongoose model for the collection
	 * @param context - Migration context with logger and configuration
	 * @returns true if migration can proceed, false otherwise
	 */
	validate?(model: Model<TDocument>, context: MigrationContext): Promise<boolean>;
}

/**
 * Registry entry for a collection's migrations.
 * Groups all migrations for a specific collection.
 */
export interface CollectionMigrationRegistry {
	/** Name of the collection */
	collectionName: string;
	/** Mongoose model for the collection */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	model: Model<any>;
	/** Current schema version expected by the application */
	currentVersion: SchemaVersion;
	/** Array of migrations in chronological order */
	migrations: ISchemaMigration[];
}
