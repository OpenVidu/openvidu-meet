import { inject, injectable } from 'inversify';
import { Model } from 'mongoose';
import ms from 'ms';
import { MeetLock } from '../helpers/redis.helper.js';
import { migrationRegistry } from '../migrations/migration-registry.js';
import {
	CollectionMigrationRegistry,
	generateSchemaMigrationName,
	ISchemaMigration,
	MigrationContext,
	MigrationName
} from '../models/migration.model.js';
import { ApiKeyRepository } from '../repositories/api-key.repository.js';
import { GlobalConfigRepository } from '../repositories/global-config.repository.js';
import { MigrationRepository } from '../repositories/migration.repository.js';
import { RecordingRepository } from '../repositories/recording.repository.js';
import { RoomRepository } from '../repositories/room.repository.js';
import { UserRepository } from '../repositories/user.repository.js';
import { LoggerService } from './logger.service.js';
import { MutexService } from './mutex.service.js';

@injectable()
export class MigrationService {
	constructor(
		@inject(LoggerService) protected logger: LoggerService,
		@inject(MutexService) protected mutexService: MutexService,
		@inject(GlobalConfigRepository) protected configRepository: GlobalConfigRepository,
		@inject(UserRepository) protected userRepository: UserRepository,
		@inject(ApiKeyRepository) protected apiKeyRepository: ApiKeyRepository,
		@inject(RoomRepository) protected roomRepository: RoomRepository,
		@inject(RecordingRepository) protected recordingRepository: RecordingRepository,
		@inject(MigrationRepository) protected migrationRepository: MigrationRepository
	) {}

	/**
	 * Runs all necessary migrations to update existing data structures.
	 * This method should be called during startup to ensure backwards compatibility.
	 *
	 * Uses distributed locking to ensure only one instance runs migrations in HA mode.
	 */
	async runMigrations(): Promise<void> {
		this.logger.info('Running migrations...');
		const lockKey = MeetLock.getMigrationLock();
		let lockAcquired = false;

		try {
			// Acquire a global lock to prevent multiple migrations at the same time when running in HA mode
			const lock = await this.mutexService.acquire(lockKey, ms('5m'));

			if (!lock) {
				this.logger.warn('Unable to acquire lock for migrations. May be already running on another instance.');
				return;
			}

			lockAcquired = true;

			// Run schema migrations to upgrade document structures
			await this.runSchemaMigrations();

			this.logger.info('All migrations completed successfully');
		} catch (error) {
			this.logger.error('Error running migrations:', error);
			throw error;
		} finally {
			// Always release the lock after migrations complete or fail
			if (lockAcquired) {
				await this.mutexService.release(lockKey);
				this.logger.debug('Migration lock released');
			}
		}
	}

	/**
	 * Runs all schema migrations to upgrade document structures to the latest version.
	 * Processes each collection in the registry and executes pending migrations.
	 *
	 * Schema migrations run after data migrations and upgrade existing documents
	 * to match the current schema version expected by the application.
	 */
	protected async runSchemaMigrations(): Promise<void> {
		this.logger.info('Running schema migrations...');

		try {
			let totalMigrated = 0;
			let totalSkipped = 0;

			// Process each collection in the registry
			for (const registry of migrationRegistry) {
				this.logger.info(`Checking schema version for collection: ${registry.collectionName}`);

				// Get the current version of documents in the collection
				const currentVersionInDb = await this.getCurrentSchemaVersion(registry.model);

				if (currentVersionInDb === null) {
					this.logger.info(`No documents found in ${registry.collectionName}, skipping migration`);
					continue;
				}

				if (currentVersionInDb === registry.currentVersion) {
					this.logger.info(
						`Collection ${registry.collectionName} is already at version ${registry.currentVersion}`
					);
					continue;
				}

				if (currentVersionInDb > registry.currentVersion) {
					this.logger.warn(
						`Collection ${registry.collectionName} has version ${currentVersionInDb} ` +
							`but application expects ${registry.currentVersion}. ` +
							`This may indicate a downgrade or inconsistent deployment.`
					);
					continue;
				}

				// Find migrations needed to upgrade from current to target version
				const neededMigrations = this.findNeededMigrations(
					registry,
					currentVersionInDb,
					registry.currentVersion
				);

				if (neededMigrations.length === 0) {
					this.logger.info(`No migrations needed for ${registry.collectionName}`);
					continue;
				}

				this.logger.info(
					`Found ${neededMigrations.length} migrations for ${registry.collectionName} ` +
						`(v${currentVersionInDb} -> v${registry.currentVersion})`
				);

				// Execute each migration in sequence
				for (const migration of neededMigrations) {
					const migrationName = generateSchemaMigrationName(
						registry.collectionName,
						migration.fromVersion,
						migration.toVersion
					);

					// Check if this specific migration was already completed
					const isCompleted = await this.migrationRepository.isCompleted(migrationName as MigrationName);

					if (isCompleted) {
						this.logger.info(`Migration ${migrationName} already completed, skipping`);
						continue;
					}

					// Mark migration as started
					await this.migrationRepository.markAsStarted(migrationName as MigrationName);

					try {
						const migrationContext: MigrationContext = {
							logger: this.logger,
							batchSize: 50 // Default batch size
						};

						// Validate migration if validation method is provided
						if (migration.validate) {
							const isValid = await migration.validate(registry.model, migrationContext);

							if (!isValid) {
								throw new Error(`Validation failed for migration ${migrationName}`);
							}
						}

						// Execute the migration
						this.logger.info(`Executing migration: ${migration.description}`);
						const result = await migration.execute(registry.model, migrationContext);

						// Track statistics
						totalMigrated += result.migratedCount;
						totalSkipped += result.skippedCount;

						// Mark migration as completed with metadata
						const metadata: Record<string, unknown> = {
							collectionName: registry.collectionName,
							fromVersion: migration.fromVersion,
							toVersion: migration.toVersion,
							migratedCount: result.migratedCount,
							skippedCount: result.skippedCount,
							failedCount: result.failedCount,
							durationMs: result.durationMs
						};

						await this.migrationRepository.markAsCompleted(migrationName as MigrationName, metadata);

						this.logger.info(
							`Migration ${migrationName} completed: ${result.migratedCount} migrated, ` +
								`${result.failedCount} failed (${result.durationMs}ms)`
						);
					} catch (error) {
						// Mark migration as failed
						const errorMessage = error instanceof Error ? error.message : String(error);
						await this.migrationRepository.markAsFailed(migrationName as MigrationName, errorMessage);
						throw error;
					}
				}
			}

			this.logger.info(
				`Schema migrations completed successfully: ${totalMigrated} documents migrated, ${totalSkipped} skipped`
			);
		} catch (error) {
			this.logger.error('Error running schema migrations:', error);
			throw error;
		}
	}

	/**
	 * Gets the current schema version of documents in a collection.
	 * Samples the database to determine the version.
	 *
	 * @param model - Mongoose model for the collection
	 * @returns Current version or null if collection is empty
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	protected async getCurrentSchemaVersion(model: Model<any>): Promise<number | null> {
		try {
			// Get a sample document to check its version
			const sampleDoc = await model.findOne({}).select('schemaVersion').exec();

			if (!sampleDoc) {
				return null; // Collection is empty
			}

			// If schemaVersion doesn't exist, assume version 1 (initial version)
			return sampleDoc.schemaVersion ?? 1;
		} catch (error) {
			this.logger.error('Error getting current schema version:', error);
			throw error;
		}
	}

	/**
	 * Finds the migrations needed to upgrade from one version to another.
	 * Returns migrations in the correct order to apply.
	 *
	 * @param registry - Collection migration registry
	 * @param fromVersion - Current version in database
	 * @param toVersion - Target version from application
	 * @returns Array of migrations to execute in order
	 */
	protected findNeededMigrations(
		registry: CollectionMigrationRegistry,
		fromVersion: number,
		toVersion: number
	): ISchemaMigration[] {
		const needed: ISchemaMigration[] = [];

		// Build a chain of migrations from fromVersion to toVersion
		let currentVersion = fromVersion;

		while (currentVersion < toVersion) {
			const nextMigration = registry.migrations.find((m) => m.fromVersion === currentVersion);

			if (!nextMigration) {
				this.logger.warn(
					`No migration found from version ${currentVersion} for ${registry.collectionName}. ` +
						`Migration chain is incomplete.`
				);
				break;
			}

			needed.push(nextMigration);
			currentVersion = nextMigration.toVersion;
		}

		return needed;
	}
}
