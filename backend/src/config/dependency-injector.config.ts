import { Container } from 'inversify';
import {
	AuthService,
	MeetStorageService,
	StorageFactory,
	LiveKitService,
	LivekitWebhookService,
	LoggerService,
	MutexService,
	OpenViduWebhookService,
	ParticipantService,
	RecordingService,
	RedisService,
	RoomService,
	S3Storage,
	S3Service,
	SystemEventService,
	TaskSchedulerService,
	TokenService,
	UserService
} from '../services/index.js';

export const container: Container = new Container();

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
	container.bind(SystemEventService).toSelf().inSingletonScope();
	container.bind(MutexService).toSelf().inSingletonScope();
	container.bind(TaskSchedulerService).toSelf().inSingletonScope();
	container.bind(LoggerService).toSelf().inSingletonScope();
	container.bind(AuthService).toSelf().inSingletonScope();
	container.bind(UserService).toSelf().inSingletonScope();
	container.bind(TokenService).toSelf().inSingletonScope();
	container.bind(LiveKitService).toSelf().inSingletonScope();
	container.bind(RoomService).toSelf().inSingletonScope();
	container.bind(OpenViduWebhookService).toSelf().inSingletonScope();
	container.bind(RedisService).toSelf().inSingletonScope();
	container.bind(S3Service).toSelf().inSingletonScope();
	container.bind(RecordingService).toSelf().inSingletonScope();

	container.bind(LivekitWebhookService).toSelf().inSingletonScope();
	container.bind(MeetStorageService).toSelf().inSingletonScope();
	container.bind(ParticipantService).toSelf().inSingletonScope();

	container.bind(S3Storage).toSelf().inSingletonScope();
	container.bind(StorageFactory).toSelf().inSingletonScope();
};

export const initializeEagerServices = async () => {
	// Force the creation of services that need to be initialized at startup
	container.get(RecordingService);
	await container.get(MeetStorageService).buildAndSaveDefaultPreferences();
};

export { injectable, inject } from 'inversify';
