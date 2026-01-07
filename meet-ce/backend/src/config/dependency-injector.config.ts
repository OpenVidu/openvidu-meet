import { Container } from 'inversify';
import { MEET_ENV } from '../environment.js';

import { ApiKeyRepository } from '../repositories/api-key.repository.js';
import { BaseRepository } from '../repositories/base.repository.js';
import { GlobalConfigRepository } from '../repositories/global-config.repository.js';
import { MigrationRepository } from '../repositories/migration.repository.js';
import { RecordingRepository } from '../repositories/recording.repository.js';
import { RoomRepository } from '../repositories/room.repository.js';
import { UserRepository } from '../repositories/user.repository.js';

/*
 * Services should be imported in order of use, starting with services
 * without dependencies and then the services that depend on others. This
 * helps avoid dependency cycles and ensures constructors receive the
 * dependencies already registered in the container.
 */
import { LoggerService } from '../services/logger.service.js';
import { RedisService } from '../services/redis.service.js';
import { DistributedEventService } from '../services/distributed-event.service.js';
import { MutexService } from '../services/mutex.service.js';
import { TaskSchedulerService } from '../services/task-scheduler.service.js';
import { BaseUrlService } from '../services/base-url.service.js';
import { RequestSessionService } from '../services/request-session.service.js';

import { TokenService } from '../services/token.service.js';
import { UserService } from '../services/user.service.js';
import { ApiKeyService } from '../services/api-key.service.js';
import { GlobalConfigService } from '../services/global-config.service.js';

import { S3Service } from '../services/storage/providers/s3/s3.service.js';
import { S3KeyBuilder } from '../services/storage/providers/s3/s3-storage-key.builder.js';
import { S3StorageProvider } from '../services/storage/providers/s3/s3-storage.provider.js';
import { ABSService } from '../services/storage/providers/abs/abs.service.js';
import { ABSStorageProvider } from '../services/storage/providers/abs/abs-storage.provider.js';
import { GCSService } from '../services/storage/providers/gcp/gcs.service.js';
import { GCSStorageProvider } from '../services/storage/providers/gcp/gcs-storage.provider.js';

import { MongoDBService } from '../services/storage/mongodb.service.js';
import { StorageInitService } from '../services/storage/storage-init.service.js';
import { StorageKeyBuilder, StorageProvider } from '../services/storage/storage.interface.js';
import { StorageFactory } from '../services/storage/storage.factory.js';
import { BlobStorageService } from '../services/storage/blob-storage.service.js';

import { MigrationService } from '../services/migration.service.js';
import { LiveKitService } from '../services/livekit.service.js';
import { FrontendEventService } from '../services/frontend-event.service.js';
import { RecordingService } from '../services/recording.service.js';
import { RoomService } from '../services/room.service.js';
import { ParticipantNameService } from '../services/participant-name.service.js';
import { RoomMemberService } from '../services/room-member.service.js';
import { OpenViduWebhookService } from '../services/openvidu-webhook.service.js';
import { LivekitWebhookService } from '../services/livekit-webhook.service.js';
import { RoomScheduledTasksService } from '../services/room-scheduled-tasks.service.js';
import { RecordingScheduledTasksService } from '../services/recording-scheduled-tasks.service.js';
import { AnalyticsService } from '../services/analytics.service.js';

export const container: Container = new Container();

export const STORAGE_TYPES = {
	StorageProvider: Symbol.for('StorageProvider'),
	KeyBuilder: Symbol.for('KeyBuilder')
};

/**
 * Registers all necessary dependencies in the container.
 *
 * This function is responsible for registering services and other dependencies
 * that are required by the application. It ensures that the dependencies are
 * available for injection throughout the application.
 *
 */
export const registerDependencies = () => {
	console.log('Registering CE dependencies');
	container.bind(LoggerService).toSelf().inSingletonScope();
	container.bind(RedisService).toSelf().inSingletonScope();
	container.bind(DistributedEventService).toSelf().inSingletonScope();
	container.bind(MutexService).toSelf().inSingletonScope();
	container.bind(TaskSchedulerService).toSelf().inSingletonScope();
	container.bind(BaseUrlService).toSelf().inSingletonScope();
	// RequestSessionService uses AsyncLocalStorage for request isolation
	// It's a singleton but provides per-request data isolation automatically
	container.bind(RequestSessionService).toSelf().inSingletonScope();

	container.bind(MongoDBService).toSelf().inSingletonScope();
	container.bind(BaseRepository).toSelf().inSingletonScope();
	container.bind(RoomRepository).toSelf().inSingletonScope();
	container.bind(UserRepository).toSelf().inSingletonScope();
	container.bind(ApiKeyRepository).toSelf().inSingletonScope();
	container.bind(GlobalConfigRepository).toSelf().inSingletonScope();
	container.bind(RecordingRepository).toSelf().inSingletonScope();
	container.bind(MigrationRepository).toSelf().inSingletonScope();

	container.bind(TokenService).toSelf().inSingletonScope();
	container.bind(UserService).toSelf().inSingletonScope();
	container.bind(ApiKeyService).toSelf().inSingletonScope();
	container.bind(GlobalConfigService).toSelf().inSingletonScope();

	configureStorage(MEET_ENV.BLOB_STORAGE_MODE);
	container.bind(StorageFactory).toSelf().inSingletonScope();
	container.bind(BlobStorageService).toSelf().inSingletonScope();
	container.bind(StorageInitService).toSelf().inSingletonScope();
	container.bind(MigrationService).toSelf().inSingletonScope();

	container.bind(FrontendEventService).toSelf().inSingletonScope();
	container.bind(LiveKitService).toSelf().inSingletonScope();
	container.bind(RecordingService).toSelf().inSingletonScope();
	container.bind(RoomService).toSelf().inSingletonScope();
	container.bind(ParticipantNameService).toSelf().inSingletonScope();
	container.bind(RoomMemberService).toSelf().inSingletonScope();
	container.bind(OpenViduWebhookService).toSelf().inSingletonScope();
	container.bind(LivekitWebhookService).toSelf().inSingletonScope();
	container.bind(RoomScheduledTasksService).toSelf().inSingletonScope();
	container.bind(RecordingScheduledTasksService).toSelf().inSingletonScope();
	container.bind(AnalyticsService).toSelf().inSingletonScope();
};

const configureStorage = (storageMode: string) => {
	container.get(LoggerService).info(`Creating ${storageMode} storage provider`);

	switch (storageMode) {
		default:
		case 's3':
			container.bind<StorageProvider>(STORAGE_TYPES.StorageProvider).to(S3StorageProvider).inSingletonScope();
			container.bind<StorageKeyBuilder>(STORAGE_TYPES.KeyBuilder).to(S3KeyBuilder).inSingletonScope();
			container.bind(S3Service).toSelf().inSingletonScope();
			container.bind(S3StorageProvider).toSelf().inSingletonScope();
			break;
		case 'abs':
			container.bind<StorageProvider>(STORAGE_TYPES.StorageProvider).to(ABSStorageProvider).inSingletonScope();
			container.bind<StorageKeyBuilder>(STORAGE_TYPES.KeyBuilder).to(S3KeyBuilder).inSingletonScope();
			container.bind(ABSService).toSelf().inSingletonScope();
			container.bind(ABSStorageProvider).toSelf().inSingletonScope();
			break;
		case 'gcs':
			container.bind<StorageProvider>(STORAGE_TYPES.StorageProvider).to(GCSStorageProvider).inSingletonScope();
			container.bind<StorageKeyBuilder>(STORAGE_TYPES.KeyBuilder).to(S3KeyBuilder).inSingletonScope();
			container.bind(GCSService).toSelf().inSingletonScope();
			container.bind(GCSStorageProvider).toSelf().inSingletonScope();
			break;
	}
};

export const initializeEagerServices = async () => {
	// Connect to MongoDB and check health
	const mongoService = container.get(MongoDBService);
	await mongoService.connect();
	await mongoService.checkHealth();

	// Perform blob storage health check
	const blobStorageService = container.get(BlobStorageService);
	await blobStorageService.checkHealth();

	// Run migrations
	const migrationService = container.get(MigrationService);
	await migrationService.runMigrations();

	// Initialize storage
	const storageInitService = container.get(StorageInitService);
	await storageInitService.initializeStorage();

	// Initialize scheduled tasks services to register their cron jobs
	container.get(RecordingScheduledTasksService);
	container.get(RoomScheduledTasksService);
};
