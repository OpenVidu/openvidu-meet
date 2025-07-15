import { Container } from 'inversify';
import { MEET_PREFERENCES_STORAGE_MODE } from '../environment.js';
import {
	ABSService,
	ABSStorageProvider,
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
	S3KeyBuilder,
	S3Service,
	S3StorageProvider,
	StorageFactory,
	StorageKeyBuilder,
	StorageProvider,
	DistributedEventService,
	TaskSchedulerService,
	TokenService,
	UserService,
	FrontendEventService
} from '../services/index.js';

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

	configureStorage(MEET_PREFERENCES_STORAGE_MODE);
	container.bind(StorageFactory).toSelf().inSingletonScope();
	container.bind(MeetStorageService).toSelf().inSingletonScope();

	container.bind(TokenService).toSelf().inSingletonScope();
	container.bind(UserService).toSelf().inSingletonScope();
	container.bind(AuthService).toSelf().inSingletonScope();

	container.bind(FrontendEventService).toSelf().inSingletonScope();
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
		case 'abs':
			container.bind<StorageProvider>(STORAGE_TYPES.StorageProvider).to(ABSStorageProvider).inSingletonScope();
			container.bind<StorageKeyBuilder>(STORAGE_TYPES.KeyBuilder).to(S3KeyBuilder).inSingletonScope();
			container.bind(ABSService).toSelf().inSingletonScope();
			container.bind(ABSStorageProvider).toSelf().inSingletonScope();
			break;
	}
};

export const initializeEagerServices = async () => {
	// Force the creation of services that need to be initialized at startup
	container.get(RecordingService);

	// Perform comprehensive health checks before initializing other services
	const storageService = container.get(MeetStorageService);
	await storageService.checkStartupHealth();

	// Initialize global preferences after health checks pass
	await storageService.initializeGlobalPreferences();
};
