import { Container } from 'inversify';
import {
	AuthService,
	GlobalPreferencesService,
	GlobalPreferencesStorageFactory,
	LiveKitService,
	LivekitWebhookService,
	LoggerService,
	MutexService,
	OpenViduWebhookService,
	ParticipantService,
	RecordingService,
	RedisService,
	RoomService,
	S3PreferenceStorage,
	S3Service,
	SystemEventService,
	TaskSchedulerService,
	TokenService,
	UserService
} from '../services/index.js';

const container: Container = new Container();

/**
 * Registers all necessary dependencies in the container.
 *
 * This function is responsible for registering services and other dependencies
 * that are required by the application. It ensures that the dependencies are
 * available for injection throughout the application.
 *
 */
const registerDependencies = () => {
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
	container.bind(GlobalPreferencesService).toSelf().inSingletonScope();
	container.bind(ParticipantService).toSelf().inSingletonScope();

	container.bind(S3PreferenceStorage).toSelf().inSingletonScope();
	container.bind(GlobalPreferencesStorageFactory).toSelf().inSingletonScope();

	initializeEagerServices();
};

const initializeEagerServices = () => {
	// Force the creation of services that need to be initialized at startup
	container.get(RecordingService);
};

export { injectable, inject } from 'inversify';
export { container, registerDependencies };
