import { inject, injectable } from 'inversify';
import { Model } from 'mongoose';
import ms from 'ms';
import { MeetLock } from '../helpers/redis.helper.js';
import { runtimeMigrationRegistry } from '../migrations/migration-registry.js';
import {
	CollectionMigrationRegistry,
	generateSchemaMigrationName,
	MigrationResult,
	MigrationUpdate,
	SchemaMigratableDocument,
	SchemaMigrationStep,
	SchemaVersion
} from '../models/migration.model.js';
import { MigrationRepository } from '../repositories/migration.repository.js';
import { LoggerService } from './logger.service.js';
import { MutexService } from './mutex.service.js';

@injectable()
export class MigrationService {
	constructor(
		@inject(LoggerService) protected logger: LoggerService,
		@inject(MutexService) protected mutexService: MutexService,
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
	 */
	protected async runSchemaMigrations(): Promise<void> {
		this.logger.info('Running schema migrations...');

		try {
			let totalMigrated = 0;

			// Process each collection in the registry
			for (const registry of runtimeMigrationRegistry) {
				totalMigrated += await this.migrateCollectionSchemas(registry);
			}

			this.logger.info(`Schema migrations completed successfully: ${totalMigrated} documents migrated`);
		} catch (error) {
			this.logger.error('Error running schema migrations:', error);
			throw error;
		}
	}

	/**
	 * Migrates documents in a collection through all required schema versions to reach the current version.
	 *
	 * @param registry - The collection migration registry containing migration steps and model
	 * @returns Number of documents migrated in this collection
	 */
	protected async migrateCollectionSchemas<TDocument extends SchemaMigratableDocument>(
		registry: CollectionMigrationRegistry<TDocument>
	): Promise<number> {
		this.logger.info(`Checking schema version for collection: ${registry.collectionName}`);

		const minVersionInDb = await this.getMinSchemaVersion(registry.model);

		if (minVersionInDb === null) {
			this.logger.info(`No documents found in ${registry.collectionName}, skipping migration`);
			return 0;
		}

		const maxVersionInDb = await this.getMaxSchemaVersion(registry.model);

		if (maxVersionInDb && maxVersionInDb > registry.currentVersion) {
			throw new Error(
				`Collection ${registry.collectionName} has schemaVersion ${maxVersionInDb}, ` +
					`which is higher than expected ${registry.currentVersion}. ` +
					'Startup aborted to prevent inconsistent schema handling.'
			);
		}

		if (minVersionInDb === registry.currentVersion) {
			this.logger.info(`Collection ${registry.collectionName} is already at version ${registry.currentVersion}`);
			return 0;
		}

		const migrationSteps = this.getRequiredMigrationSteps(registry, minVersionInDb);
		let collectionMigrated = 0;

		for (const migrationStep of migrationSteps) {
			collectionMigrated += await this.executeCollectionMigrationStep(registry, migrationStep);
		}

		return collectionMigrated;
	}

	/**
	 * Gets the required migration steps to upgrade from the current version in the database to the target version.
	 * Validates that there are no missing migration steps in the chain.
	 *
	 * @param registry - The collection migration registry
	 * @param minVersionInDb - The minimum schema version currently present in the database
	 * @returns Array of migration steps that need to be executed in order
	 */
	protected getRequiredMigrationSteps<TDocument extends SchemaMigratableDocument>(
		registry: CollectionMigrationRegistry<TDocument>,
		minVersionInDb: SchemaVersion
	): SchemaMigrationStep<TDocument>[] {
		const migrationSteps = this.findSchemaMigrationSteps(registry, minVersionInDb, registry.currentVersion);

		if (migrationSteps.length === 0) {
			throw new Error(
				`No migration steps found for ${registry.collectionName} ` +
					`(v${minVersionInDb} -> v${registry.currentVersion}). Startup aborted.`
			);
		}

		this.logger.info(
			`Found ${migrationSteps.length} migration steps for ${registry.collectionName} ` +
				`(v${minVersionInDb} -> v${registry.currentVersion})`
		);

		return migrationSteps;
	}

	/**
	 * Executes a single migration step for a collection, applying the transform to all documents at the fromVersion.
	 * Handles marking the migration as started, completed, or failed in the migration repository.
	 *
	 * @param registry - The collection migration registry
	 * @param migrationStep - The specific migration step to execute
	 * @returns Number of documents migrated in this step
	 */
	protected async executeCollectionMigrationStep<TDocument extends SchemaMigratableDocument>(
		registry: CollectionMigrationRegistry<TDocument>,
		migrationStep: SchemaMigrationStep<TDocument>
	): Promise<number> {
		const pendingBefore = await this.countDocumentsAtSchemaVersion(registry.model, migrationStep.fromVersion);

		if (pendingBefore === 0) {
			this.logger.info(`Migration ${migrationStep.name} has no pending documents, skipping execution`);
			return 0;
		}

		const isCompleted = await this.migrationRepository.isCompleted(migrationStep.name);

		if (isCompleted) {
			this.logger.warn(
				`Migration ${migrationStep.name} is marked as completed but still has ${pendingBefore} pending ` +
					`documents at schemaVersion ${migrationStep.fromVersion}. Re-running migration step.`
			);
		}

		await this.migrationRepository.markAsStarted(migrationStep.name);

		try {
			this.logger.info(`Executing migration: ${migrationStep.name}`);
			const result = await this.runSchemaMigrationStep(migrationStep, registry.model);
			const pendingAfter = await this.countDocumentsAtSchemaVersion(registry.model, migrationStep.fromVersion);

			const metadata: Record<string, unknown> = {
				collectionName: registry.collectionName,
				fromVersion: migrationStep.fromVersion,
				toVersion: migrationStep.toVersion,
				migratedCount: result.migratedCount,
				failedCount: result.failedCount,
				pendingBefore,
				pendingAfter,
				durationMs: result.durationMs
			};

			if (result.failedCount > 0 || pendingAfter > 0) {
				const failureReason =
					`Migration ${migrationStep.name} did not complete successfully. ` +
					`failedCount=${result.failedCount}, pendingAfter=${pendingAfter}`;

				await this.migrationRepository.markAsFailed(migrationStep.name, failureReason);
				throw new Error(failureReason);
			}

			await this.migrationRepository.markAsCompleted(migrationStep.name, metadata);

			this.logger.info(
				`Migration ${migrationStep.name} completed: ${result.migratedCount} documents migrated (${result.durationMs}ms)`
			);

			return result.migratedCount;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			await this.migrationRepository.markAsFailed(migrationStep.name, errorMessage);
			throw error;
		}
	}

	/**
	 * Executes a single schema migration step on all documents that match the fromVersion.
	 * Applies the transform function to each document and updates it to the toVersion.
	 *
	 * @param migrationStep - The migration step to execute
	 * @param model - Mongoose model for the collection being migrated
	 * @param batchSize - Number of documents to process in each batch. Default is 50.
	 * @returns Migration result with statistics about the execution
	 */
	protected async runSchemaMigrationStep<TDocument extends SchemaMigratableDocument>(
		migrationStep: SchemaMigrationStep<TDocument>,
		model: Model<TDocument>,
		batchSize = 50
	): Promise<MigrationResult> {
		const startTime = Date.now();
		let migratedCount = 0;
		let failedCount = 0;

		const versionFilter = { schemaVersion: migrationStep.fromVersion };
		const totalDocs = await model.countDocuments(versionFilter).exec();

		if (totalDocs === 0) {
			return {
				migratedCount,
				failedCount,
				durationMs: Date.now() - startTime
			};
		}

		let processedCount = 0;
		let lastProcessedId: TDocument['_id'] | null = null;
		let hasMoreDocuments = true;

		while (hasMoreDocuments) {
			const batchFilter =
				lastProcessedId === null
					? versionFilter
					: {
							...versionFilter,
							_id: { $gt: lastProcessedId }
						};
			const documents = await model.find(batchFilter).sort({ _id: 1 }).limit(batchSize).exec();

			if (documents.length === 0) {
				break;
			}

			const batchResults = await Promise.allSettled(
				documents.map(async (doc) => {
					const transformedUpdate = migrationStep.transform(doc);
					const update = this.appendSchemaVersionUpdate(transformedUpdate, migrationStep.toVersion);
					await model.updateOne({ _id: doc._id }, update).exec();
					return String(doc._id);
				})
			);

			for (let i = 0; i < batchResults.length; i++) {
				const batchResult = batchResults[i];

				if (batchResult.status === 'fulfilled') {
					migratedCount++;
					continue;
				}

				failedCount++;
				this.logger.warn(`Failed to migrate document ${String(documents[i]._id)}:`, batchResult.reason);
			}

			processedCount += documents.length;
			lastProcessedId = documents[documents.length - 1]._id;
			hasMoreDocuments = documents.length === batchSize;
			this.logger.debug(`Processed ${processedCount}/${totalDocs} documents`);
		}

		return {
			migratedCount,
			failedCount,
			durationMs: Date.now() - startTime
		};
	}

	/**
	 * Gets the minimum schema version present in the collection to detect the oldest pending version of documents.
	 *
	 * @param model - Mongoose model for the collection
	 * @returns Current version or null if collection is empty
	 */
	protected async getMinSchemaVersion<TDocument extends SchemaMigratableDocument>(
		model: Model<TDocument>
	): Promise<SchemaVersion | null> {
		try {
			const sampleDoc = await model.findOne({}).sort({ schemaVersion: 1 }).select('schemaVersion').exec();

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
	 * Gets the maximum schema version present in the collection to detect if there are any documents above expected version.
	 *
	 * @param model - Mongoose model for the collection
	 * @returns Maximum version or null if collection is empty
	 */
	protected async getMaxSchemaVersion<TDocument extends SchemaMigratableDocument>(
		model: Model<TDocument>
	): Promise<SchemaVersion | null> {
		try {
			const sampleDoc = await model.findOne({}).sort({ schemaVersion: -1 }).select('schemaVersion').exec();

			if (!sampleDoc) {
				return null; // Collection is empty
			}

			return sampleDoc.schemaVersion ?? 1;
		} catch (error) {
			this.logger.error('Error getting max schema version:', error);
			throw error;
		}
	}

	/**
	 * Counts how many documents are at a specific schema version.
	 *
	 * @param model - Mongoose model for the collection
	 * @param schemaVersion - Schema version to count
	 * @returns Number of documents at the specified schema version
	 */
	protected async countDocumentsAtSchemaVersion<TDocument extends SchemaMigratableDocument>(
		model: Model<TDocument>,
		schemaVersion: SchemaVersion
	): Promise<number> {
		return model.countDocuments({ schemaVersion }).exec();
	}

	/**
	 * Finds the schema migration steps needed to upgrade from one version to another.
	 * Returns migrations in the correct order to apply.
	 *
	 * @param registry - Collection migration registry
	 * @param fromVersion - Current version in database
	 * @param toVersion - Target version from application
	 * @returns Array of schema migration steps to execute in order
	 */
	protected findSchemaMigrationSteps<TDocument extends SchemaMigratableDocument>(
		registry: CollectionMigrationRegistry<TDocument>,
		fromVersion: SchemaVersion,
		toVersion: SchemaVersion
	): SchemaMigrationStep<TDocument>[] {
		const needed: SchemaMigrationStep<TDocument>[] = [];

		// Build a chain of migrations from fromVersion to toVersion
		let currentVersion = fromVersion;

		while (currentVersion < toVersion) {
			const nextVersion = currentVersion + 1;
			const expectedMigrationName = generateSchemaMigrationName(
				registry.collectionName,
				currentVersion,
				nextVersion
			);
			const transform = registry.migrations.get(expectedMigrationName);

			if (!transform) {
				throw new Error(
					`No migration found from version ${currentVersion} to ${nextVersion} for ` +
						`${registry.collectionName}. Migration chain is incomplete.`
				);
			}

			needed.push({
				name: expectedMigrationName,
				fromVersion: currentVersion,
				toVersion: nextVersion,
				transform
			});
			currentVersion = nextVersion;
		}

		return needed;
	}

	/**
	 * Appends a schemaVersion update to the migration update operation.
	 * Ensures that migrated documents are marked with the new version.
	 *
	 * @param update - Original migration update operation
	 * @param toVersion - Target schema version to set
	 * @returns Updated migration operation with schemaVersion set
	 */
	protected appendSchemaVersionUpdate<TDocument extends SchemaMigratableDocument>(
		update: MigrationUpdate<TDocument>,
		toVersion: SchemaVersion
	): MigrationUpdate<TDocument> {
		return {
			...update,
			$set: {
				...(update.$set ?? {}),
				schemaVersion: toVersion
			}
		};
	}
}
