import { Container } from 'inversify';
import {
	AuthService,
	LiveKitService,
	LivekitWebhookService,
	LoggerService,
	MeetStorageService,
	MutexService,
	OpenViduWebhookService,
	ParticipantService,
	RecordingService,
	RedisService,
	RoomService,
	S3Service,
	S3StorageProvider,
	AzureBlobService,
	AzureStorageProvider,
	StorageFactory,
	StorageKeyBuilder,
	StorageProvider,
	SystemEventService,
	TaskSchedulerService,
	TokenService,
	UserService
} from '../services/index.js';
import { MEET_PREFERENCES_STORAGE_MODE } from '../environment.js';
import { S3KeyBuilder } from '../services/storage/providers/s3/s3-storage-key.builder.js';

export const container: Container = new Container();

export const STORAGE_TYPES = {
	StorageProvider: Symbol.for('StorageProvider'),
	KeyBuilder: Symbol.for('KeyBuilder'),
	S3StorageProvider: Symbol.for('S3StorageProvider'),
	S3KeyBuilder: Symbol.for('S3KeyBuilder')
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
	container.bind(SystemEventService).toSelf().inSingletonScope();
	container.bind(MutexService).toSelf().inSingletonScope();
	container.bind(TaskSchedulerService).toSelf().inSingletonScope();

	configureStorage(MEET_PREFERENCES_STORAGE_MODE);
	container.bind(StorageFactory).toSelf().inSingletonScope();
	container.bind(MeetStorageService).toSelf().inSingletonScope();

	container.bind(TokenService).toSelf().inSingletonScope();
	container.bind(UserService).toSelf().inSingletonScope();
	container.bind(AuthService).toSelf().inSingletonScope();

	container.bind(LiveKitService).toSelf().inSingletonScope();
	container.bind(RoomService).toSelf().inSingletonScope();
	container.bind(ParticipantService).toSelf().inSingletonScope();
	container.bind(RecordingService).toSelf().inSingletonScope();
	container.bind(OpenViduWebhookService).toSelf().inSingletonScope();
	container.bind(LivekitWebhookService).toSelf().inSingletonScope();
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
		case 'azure':
			container.bind<StorageProvider>(STORAGE_TYPES.StorageProvider).to(AzureStorageProvider).inSingletonScope();
			container.bind<StorageKeyBuilder>(STORAGE_TYPES.KeyBuilder).to(S3KeyBuilder).inSingletonScope();
			container.bind(AzureBlobService).toSelf().inSingletonScope();
			container.bind(AzureStorageProvider).toSelf().inSingletonScope();
	}
};

export const initializeEagerServices = async () => {
	// Force the creation of services that need to be initialized at startup
	container.get(RecordingService);
	await container.get(MeetStorageService).initializeGlobalPreferences();
};
