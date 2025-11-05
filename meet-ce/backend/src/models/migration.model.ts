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
	startedAt: Date;

	/**
	 * Timestamp when the migration completed (success or failure).
	 */
	completedAt?: Date;

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
 * Enum defining all possible migration names in the system.
 * Each migration should have a unique identifier.
 */
export enum MigrationName {
	/**
	 * Migration from legacy storage (S3, ABS, GCS) to MongoDB.
	 * Includes: GlobalConfig, Users, ApiKeys, Rooms, and Recordings.
	 */
	LEGACY_STORAGE_TO_MONGODB = 'legacy_storage_to_mongodb'
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
