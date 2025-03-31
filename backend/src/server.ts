import express, { Request, Response, Express } from 'express';
import cors from 'cors';
import chalk from 'chalk';
import { registerDependencies, container } from './config/dependency-injector.config.js';
import {
	SERVER_PORT,
	SERVER_CORS_ORIGIN,
	logEnvVars,
	MEET_API_BASE_PATH_V1,
	MEET_INTERNAL_API_BASE_PATH_V1
} from './environment.js';
import { openapiHtmlPath, indexHtmlPath, publicFilesPath, webcomponentBundlePath } from './utils/path-utils.js';
import {
	authRouter,
	internalRecordingRouter,
	internalRoomRouter,
	livekitWebhookRouter,
	preferencesRouter,
	recordingRouter,
	roomRouter
} from './routes/index.js';
import { GlobalPreferencesService } from './services/index.js';
import { internalParticipantsRouter } from './routes/participants.routes.js';
import cookieParser from 'cookie-parser';

const createApp = () => {
	const app: Express = express();

	// Enable CORS support
	if (SERVER_CORS_ORIGIN) {
		app.use(
			cors({
				origin: SERVER_CORS_ORIGIN,
				credentials: true
			})
		);
	}

	// Serve static files
	app.use(express.static(publicFilesPath));
	app.use(express.json());
	app.use(cookieParser());

	app.use(`${MEET_API_BASE_PATH_V1}/docs`, (_req: Request, res: Response) => res.sendFile(openapiHtmlPath));
	app.use(`${MEET_API_BASE_PATH_V1}/rooms`, /*mediaTypeValidatorMiddleware,*/ roomRouter);
	app.use(`${MEET_API_BASE_PATH_V1}/recordings`, /*mediaTypeValidatorMiddleware,*/ recordingRouter);
	app.use(`${MEET_API_BASE_PATH_V1}/auth`, /*mediaTypeValidatorMiddleware,*/ authRouter);
	app.use(`${MEET_API_BASE_PATH_V1}/preferences`, /*mediaTypeValidatorMiddleware,*/ preferencesRouter);

	// Internal routes
	app.use(`${MEET_INTERNAL_API_BASE_PATH_V1}/rooms`, internalRoomRouter);
	app.use(`${MEET_INTERNAL_API_BASE_PATH_V1}/participants`, internalParticipantsRouter);
	app.use(`${MEET_INTERNAL_API_BASE_PATH_V1}/recordings`, internalRecordingRouter);
	app.use('/meet/health', (_req: Request, res: Response) => res.status(200).send('OK'));

	// LiveKit Webhook route
	app.use('/livekit/webhook', livekitWebhookRouter);
	// Serve OpenVidu Meet webcomponent bundle file
	app.get('/meet/v1/openvidu-meet.js', (_req: Request, res: Response) => res.sendFile(webcomponentBundlePath));
	// Serve OpenVidu Meet index.html file for all non-API routes
	app.get(/^(?!\/api).*$/, (_req: Request, res: Response) => res.sendFile(indexHtmlPath));
	// Catch all other routes and return 404
	app.use((_req: Request, res: Response) => res.status(404).json({ error: 'Not found' }));

	return app;
};

const initializeGlobalPreferences = async () => {
	const globalPreferencesService = container.get(GlobalPreferencesService);
	// TODO: This should be invoked in the constructor of the service
	await globalPreferencesService.ensurePreferencesInitialized();
};

const startServer = (app: express.Application) => {
	app.listen(SERVER_PORT, async () => {
		console.log(' ');
		console.log('---------------------------------------------------------');
		console.log(' ');
		console.log('OpenVidu Meet is listening on port', chalk.cyanBright(SERVER_PORT));
		console.log(
			'REST API Docs: ',
			chalk.cyanBright(`http://localhost:${SERVER_PORT}${MEET_API_BASE_PATH_V1}/docs`)
		);
		logEnvVars();
		await Promise.all([initializeGlobalPreferences()]);
	});
};

/**
 * Determines if the current module is the main entry point of the application.
 * @returns {boolean} True if this module is the main entry point, false otherwise.
 */
const isMainModule = (): boolean => {
	const importMetaUrl = import.meta.url;
	let processArgv1 = process.argv[1];

	if (process.platform === 'win32') {
		processArgv1 = processArgv1.replace(/\\/g, '/');
		processArgv1 = `file:///${processArgv1}`;
	} else {
		processArgv1 = `file://${processArgv1}`;
	}

	return importMetaUrl === processArgv1;
};

if (isMainModule()) {
	registerDependencies();
	const app = createApp();
	startServer(app);
}

export { registerDependencies, createApp, initializeGlobalPreferences };
