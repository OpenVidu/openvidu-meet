import { inject, injectable } from 'inversify';
import { Model } from 'mongoose';
import ms from 'ms';
import { MeetLock } from '../helpers/index.js';
import { migrationRegistry } from '../migrations/index.js';
import {
	CollectionMigrationRegistry,
	generateSchemaMigrationName,
	ISchemaMigration,
	MigrationContext,
	MigrationName
} from '../models/index.js';
import {
	ApiKeyRepository,
	GlobalConfigRepository,
	MigrationRepository,
	RecordingRepository,
	RoomRepository,
	UserRepository
} from '../repositories/index.js';
import { LegacyStorageService, LoggerService, MutexService } from './index.js';

@injectable()
export class MigrationService {
	constructor(
		@inject(LoggerService) protected logger: LoggerService,
		@inject(MutexService) protected mutexService: MutexService,
		@inject(LegacyStorageService) protected storageService: LegacyStorageService,
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

			// Migrate data from legacy storage to MongoDB if needed
			await this.runMigrationsFromLegacyStorageToMongoDB();

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
	 * Orchestrates the migration from legacy storage to MongoDB.
	 * Calls individual migration methods in the correct order.
	 */
	protected async runMigrationsFromLegacyStorageToMongoDB(): Promise<void> {
		const migrationName = MigrationName.LEGACY_STORAGE_TO_MONGODB;

		// Check if legacy storage migration has already been completed
		const isLegacyMigrationCompleted = await this.migrationRepository.isCompleted(migrationName);

		if (isLegacyMigrationCompleted) {
			this.logger.info('Legacy storage migration already completed. Skipping...');
			return;
		}

		this.logger.info('Running migrations from legacy storage to MongoDB...');

		try {
			// Mark migration as started
			await this.migrationRepository.markAsStarted(migrationName);

			// Run the actual migrations
			await Promise.all([
				this.migrateLegacyGlobalConfig(),
				this.migrateLegacyUsers(),
				this.migrateLegacyApiKeys()
			]);
			await this.migrateLegacyRooms();
			await this.migrateLegacyRecordings();

			// Mark migration as completed
			await this.migrationRepository.markAsCompleted(migrationName);

			this.logger.info('Legacy storage migration completed successfully');
		} catch (error) {
			this.logger.error('Error running migrations from legacy storage to MongoDB:', error);

			// Mark migration as failed
			const errorMessage = error instanceof Error ? error.message : String(error);
			await this.migrationRepository.markAsFailed(migrationName, errorMessage);

			throw error;
		}
	}

	/**
	 * Migrates global configuration from legacy storage to MongoDB.
	 * Applies any missing fields for backwards compatibility.
	 */
	protected async migrateLegacyGlobalConfig(): Promise<void> {
		this.logger.info('Migrating global configuration from legacy storage to MongoDB...');

		try {
			// Check if config already exists in MongoDB
			const existingConfig = await this.configRepository.get();

			if (existingConfig) {
				this.logger.info('Global config already exists in MongoDB, skipping migration');
				return;
			}

			// Try to get config from legacy storage
			const legacyConfig = await this.storageService.getGlobalConfig();

			if (!legacyConfig) {
				this.logger.info('No global config found in legacy storage, skipping migration');
				return;
			}

			// Save to MongoDB
			await this.configRepository.create(legacyConfig);
			this.logger.info('Global config migrated successfully');

			// Delete from legacy storage
			await this.storageService.deleteGlobalConfig();
			this.logger.info('Legacy global config deleted');
		} catch (error) {
			this.logger.error('Error migrating global config from legacy storage to MongoDB:', error);
			throw error;
		}
	}

	/**
	 * Migrates users from legacy storage to MongoDB.
	 */
	protected async migrateLegacyUsers(): Promise<void> {
		this.logger.info('Migrating users from legacy storage to MongoDB...');

		try {
			// Legacy storage only had one user (admin)
			// We need to check for the default admin username
			const adminUsername = 'admin'; // Default username in legacy systems

			const legacyUser = await this.storageService.getUser(adminUsername);

			if (!legacyUser) {
				this.logger.info('No users found in legacy storage, skipping migration');
				return;
			}

			// Check if user already exists in MongoDB
			const existingUser = await this.userRepository.findByUsername(legacyUser.username);

			if (existingUser) {
				this.logger.info(`User '${legacyUser.username}' already exists in MongoDB, skipping`);
				return;
			}

			// Save to MongoDB
			await this.userRepository.create(legacyUser);
			this.logger.info(`User '${legacyUser.username}' migrated successfully`);

			// Delete from legacy storage
			await this.storageService.deleteUser(legacyUser.username);
			this.logger.info(`Legacy user '${legacyUser.username}' deleted`);
		} catch (error) {
			this.logger.error('Error migrating users from legacy storage to MongoDB:', error);
			throw error;
		}
	}

	/**
	 * Migrates API keys from legacy storage to MongoDB.
	 */
	protected async migrateLegacyApiKeys(): Promise<void> {
		this.logger.info('Migrating API key from legacy storage to MongoDB...');

		try {
			const legacyApiKeys = await this.storageService.getApiKeys();

			if (!legacyApiKeys || legacyApiKeys.length === 0) {
				this.logger.info('No API key found in legacy storage, skipping migration');
				return;
			}

			// Check if an API key already exists in MongoDB
			const existingApiKeys = await this.apiKeyRepository.findAll();

			if (existingApiKeys.length > 0) {
				this.logger.info('API key already exists in MongoDB, skipping migration');
				return;
			}

			// Save to MongoDB
			// Only one API key existed in legacy storage
			await this.apiKeyRepository.create(legacyApiKeys[0]);
			this.logger.info(`API key migrated successfully`);

			// Delete from legacy storage
			await this.storageService.deleteApiKeys();
			this.logger.info('Legacy API key deleted');
		} catch (error) {
			this.logger.error('Error migrating API keys from legacy storage to MongoDB:', error);
			throw error;
		}
	}

	/**
	 * Migrates rooms from legacy storage to MongoDB.
	 * Processes rooms in batches for better performance.
	 */
	protected async migrateLegacyRooms(): Promise<void> {
		this.logger.info('Migrating rooms from legacy storage to MongoDB...');

		try {
			let migratedCount = 0;
			let skippedCount = 0;
			let nextPageToken: string | undefined;
			const batchSize = 50; // Process rooms in batches

			do {
				// Get batch of rooms from legacy storage
				const { rooms, nextPageToken: nextToken } = await this.storageService.getRooms(
					undefined,
					batchSize,
					nextPageToken
				);

				if (rooms.length === 0) {
					break;
				}

				const roomIdsToDelete: string[] = [];

				for (const room of rooms) {
					try {
						// Check if room already exists in MongoDB
						const existingRoom = await this.roomRepository.findByRoomId(room.roomId);

						if (existingRoom) {
							this.logger.debug(`Room '${room.roomId}' already exists in MongoDB, skipping`);
							skippedCount++;
							roomIdsToDelete.push(room.roomId);
							continue;
						}

						// Save to MongoDB
						await this.roomRepository.create(room);
						migratedCount++;
						roomIdsToDelete.push(room.roomId);
						this.logger.debug(`Room '${room.roomId}' migrated successfully`);
					} catch (error) {
						this.logger.warn(`Failed to migrate room '${room.roomId}':`, error);
					}
				}

				// Delete migrated rooms from legacy storage
				if (roomIdsToDelete.length > 0) {
					await this.storageService.deleteRooms(roomIdsToDelete);
					this.logger.debug(`Deleted ${roomIdsToDelete.length} rooms from legacy storage`);

					// Try to delete archived room metadata in parallel for better performance
					// No need to check if exists first - just attempt deletion
					const archivedMetadataPromises = roomIdsToDelete.map(async (roomId) => {
						try {
							await this.storageService.deleteArchivedRoomMetadata(roomId);
							this.logger.debug(`Deleted archived metadata for room '${roomId}'`);
						} catch (error) {
							// Silently ignore if archived metadata doesn't exist
							// Only log if it's an unexpected error
							const errorMessage = error instanceof Error ? error.message : String(error);

							if (!errorMessage.includes('not found') && !errorMessage.includes('does not exist')) {
								this.logger.warn(`Failed to delete archived metadata for room '${roomId}':`, error);
							}
						}
					});

					await Promise.allSettled(archivedMetadataPromises);
				}

				nextPageToken = nextToken;
			} while (nextPageToken);

			this.logger.info(`Rooms migration completed: ${migratedCount} migrated, ${skippedCount} skipped`);
		} catch (error) {
			this.logger.error('Error migrating rooms from legacy storage to MongoDB:', error);
			throw error;
		}
	}

	/**
	 * Migrates recordings from legacy storage to MongoDB.
	 * Processes recordings in batches and includes access secrets.
	 */
	protected async migrateLegacyRecordings(): Promise<void> {
		this.logger.info('Migrating recordings from legacy storage to MongoDB...');

		try {
			let migratedCount = 0;
			let skippedCount = 0;
			let nextPageToken: string | undefined;
			const batchSize = 50; // Process recordings in batches

			do {
				// Get batch of recordings from legacy storage
				const { recordings, nextContinuationToken } = await this.storageService.getRecordings(
					undefined,
					batchSize,
					nextPageToken
				);

				if (recordings.length === 0) {
					break;
				}

				const recordingIdsToDelete: string[] = [];

				for (const recording of recordings) {
					try {
						// Check if recording already exists in MongoDB
						const existingRecording = await this.recordingRepository.findByRecordingId(
							recording.recordingId
						);

						if (existingRecording) {
							this.logger.debug(
								`Recording '${recording.recordingId}' already exists in MongoDB, skipping`
							);
							skippedCount++;
							recordingIdsToDelete.push(recording.recordingId);
							continue;
						}

						// Get access secrets from legacy storage
						const secrets = await this.storageService.getRecordingAccessSecrets(recording.recordingId);

						// Prepare recording document with access secrets
						const recordingWithSecrets = {
							...recording,
							accessSecrets: secrets
								? {
										public: secrets.publicAccessSecret,
										private: secrets.privateAccessSecret
									}
								: undefined
						};

						// Save to MongoDB (will generate new secrets if not provided)
						await this.recordingRepository.create(recordingWithSecrets);
						migratedCount++;
						recordingIdsToDelete.push(recording.recordingId);
						this.logger.debug(`Recording '${recording.recordingId}' migrated successfully`);
					} catch (error) {
						this.logger.warn(`Failed to migrate recording '${recording.recordingId}':`, error);
					}
				}

				// Delete migrated recordings from legacy storage (includes metadata and secrets)
				if (recordingIdsToDelete.length > 0) {
					await this.storageService.deleteRecordings(recordingIdsToDelete);
					this.logger.debug(`Deleted ${recordingIdsToDelete.length} recordings from legacy storage`);
				}

				nextPageToken = nextContinuationToken;
			} while (nextPageToken);

			this.logger.info(`Recordings migration completed: ${migratedCount} migrated, ${skippedCount} skipped`);
		} catch (error) {
			this.logger.error('Error migrating recordings from legacy storage to MongoDB:', error);
			throw error;
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
