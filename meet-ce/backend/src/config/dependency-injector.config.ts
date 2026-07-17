import { Container, ContainerModule } from 'inversify';
import { MEET_ENV } from '../environment.js';

import { ApiKeyRepository } from '../repositories/api-key.repository.js';
import { GlobalConfigRepository } from '../repositories/global-config.repository.js';
import { MigrationRepository } from '../repositories/migration.repository.js';
import { RecordingRepository } from '../repositories/recording.repository.js';
import { RoomRepository } from '../repositories/room.repository.js';
import { RoomMemberRepository } from '../repositories/room-member.repository.js';
import { UserRepository } from '../repositories/user.repository.js';

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
import type { StorageKeyBuilder, StorageProvider } from '../services/storage/storage.interface.js';
import { StorageFactory } from '../services/storage/storage.factory.js';
import { BlobStorageService } from '../services/storage/blob-storage.service.js';

import { MigrationService } from '../services/migration.service.js';
import { LiveKitService } from '../services/livekit.service.js';
import { FrontendEventService } from '../services/frontend-event.service.js';
import { RecordingService } from '../services/recording.service.js';
import { RoomService } from '../services/room.service.js';
import { ParticipantNameService } from '../services/participant-name.service.js';
import { MeetingPresenceService } from '../services/meeting-presence.service.js';
import { RoomMemberService } from '../services/room-member.service.js';
import { OpenViduWebhookService } from '../services/openvidu-webhook.service.js';
import { LivekitWebhookService } from '../services/livekit-webhook.service.js';
import { RoomScheduledTasksService } from '../services/room-scheduled-tasks.service.js';
import { RecordingScheduledTasksService } from '../services/recording-scheduled-tasks.service.js';
import { AnalyticsService } from '../services/analytics.service.js';
import { AiAssistantService } from '../services/ai-assistant.service.js';

/*
 * Dependency injection is fully explicit: every service declares its collaborators with
 * `@inject(...)` and every binding below is registered lazily as a singleton. Because bindings
 * are resolved on demand (never eagerly during registration), the ORDER in which they are
 * declared is irrelevant, and so is the order of the imports above. Grouping the bindings into
 * cohesive `ContainerModule`s makes that independence explicit: each module is self-contained and
 * `container.load(...)` can receive them in any order.
 *
 * Runtime construction cycles (e.g. RoomService needs RecordingService, and RecordingService
 * occasionally needs RoomService) are broken at the point of use with a lazy `container.get(...)`
 * lookup rather than a constructor dependency — see RecordingService#getRoomService.
 */

export const container: Container = new Container();

export const STORAGE_TYPES = {
	StorageProvider: Symbol.for('StorageProvider'),
	KeyBuilder: Symbol.for('KeyBuilder')
};

/**
 * Cross-cutting infrastructure with no domain dependencies: logging, Redis, distributed
 * coordination, scheduling, request-scoped context and the MongoDB connection.
 */
const infrastructureModule = new ContainerModule(({ bind }) => {
	bind(LoggerService).toSelf().inSingletonScope();
	bind(RedisService).toSelf().inSingletonScope();
	bind(DistributedEventService).toSelf().inSingletonScope();
	bind(MutexService).toSelf().inSingletonScope();
	bind(TaskSchedulerService).toSelf().inSingletonScope();
	bind(BaseUrlService).toSelf().inSingletonScope();
	// RequestSessionService uses AsyncLocalStorage for request isolation. It's a singleton but
	// provides per-request data isolation automatically.
	bind(RequestSessionService).toSelf().inSingletonScope();
	bind(MongoDBService).toSelf().inSingletonScope();
});

/**
 * Persistence layer. Each concrete repository extends the abstract `BaseRepository` but declares
 * its own constructor with explicit `@inject(...)`, so `BaseRepository` itself is never resolved
 * from the container and is intentionally not bound.
 */
const persistenceModule = new ContainerModule(({ bind }) => {
	bind(RoomRepository).toSelf().inSingletonScope();
	bind(RoomMemberRepository).toSelf().inSingletonScope();
	bind(UserRepository).toSelf().inSingletonScope();
	bind(ApiKeyRepository).toSelf().inSingletonScope();
	bind(GlobalConfigRepository).toSelf().inSingletonScope();
	bind(RecordingRepository).toSelf().inSingletonScope();
	bind(MigrationRepository).toSelf().inSingletonScope();
});

/**
 * Blob storage bindings. Only the provider, key builder and provider-specific client differ per
 * storage mode; the factory, facade and initialization services are mode-agnostic.
 */
const createStorageModule = (storageMode: string): ContainerModule =>
	new ContainerModule(({ bind }) => {
		switch (storageMode) {
			default:
			case 's3':
				bind<StorageProvider>(STORAGE_TYPES.StorageProvider).to(S3StorageProvider).inSingletonScope();
				bind<StorageKeyBuilder>(STORAGE_TYPES.KeyBuilder).to(S3KeyBuilder).inSingletonScope();
				bind(S3Service).toSelf().inSingletonScope();
				bind(S3StorageProvider).toSelf().inSingletonScope();
				break;
			case 'abs':
				bind<StorageProvider>(STORAGE_TYPES.StorageProvider).to(ABSStorageProvider).inSingletonScope();
				bind<StorageKeyBuilder>(STORAGE_TYPES.KeyBuilder).to(S3KeyBuilder).inSingletonScope();
				bind(ABSService).toSelf().inSingletonScope();
				bind(ABSStorageProvider).toSelf().inSingletonScope();
				break;
			case 'gcs':
				bind<StorageProvider>(STORAGE_TYPES.StorageProvider).to(GCSStorageProvider).inSingletonScope();
				bind<StorageKeyBuilder>(STORAGE_TYPES.KeyBuilder).to(S3KeyBuilder).inSingletonScope();
				bind(GCSService).toSelf().inSingletonScope();
				bind(GCSStorageProvider).toSelf().inSingletonScope();
				break;
		}

		bind(StorageFactory).toSelf().inSingletonScope();
		bind(BlobStorageService).toSelf().inSingletonScope();
		bind(StorageInitService).toSelf().inSingletonScope();
	});

/**
 * Domain services (rooms, recordings, meetings, users, webhooks, scheduled tasks, ...).
 */
const domainModule = new ContainerModule(({ bind }) => {
	bind(TokenService).toSelf().inSingletonScope();
	bind(UserService).toSelf().inSingletonScope();
	bind(ApiKeyService).toSelf().inSingletonScope();
	bind(GlobalConfigService).toSelf().inSingletonScope();
	bind(MigrationService).toSelf().inSingletonScope();
	bind(FrontendEventService).toSelf().inSingletonScope();
	bind(LiveKitService).toSelf().inSingletonScope();
	bind(RecordingService).toSelf().inSingletonScope();
	bind(RoomService).toSelf().inSingletonScope();
	bind(ParticipantNameService).toSelf().inSingletonScope();
	bind(MeetingPresenceService).toSelf().inSingletonScope();
	bind(RoomMemberService).toSelf().inSingletonScope();
	bind(OpenViduWebhookService).toSelf().inSingletonScope();
	bind(LivekitWebhookService).toSelf().inSingletonScope();
	bind(RoomScheduledTasksService).toSelf().inSingletonScope();
	bind(RecordingScheduledTasksService).toSelf().inSingletonScope();
	bind(AnalyticsService).toSelf().inSingletonScope();
	bind(AiAssistantService).toSelf().inSingletonScope();
});

/**
 * Registers all necessary dependencies in the container.
 *
 * Modules are loaded in a single, order-independent `container.load(...)` call. Every binding is a
 * lazy singleton, so no service is instantiated here; construction happens on first resolution.
 */
export const registerDependencies = () => {
	container.load(
		infrastructureModule,
		persistenceModule,
		createStorageModule(MEET_ENV.BLOB_STORAGE_MODE),
		domainModule
	);

	// Safe to resolve here: all modules (including the LoggerService binding) are loaded above,
	// so this does not depend on binding order.
	container.get(LoggerService).info(`Creating ${MEET_ENV.BLOB_STORAGE_MODE} storage provider`);
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
