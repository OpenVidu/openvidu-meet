import chalk from 'chalk';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Express, Request, Response } from 'express';
import { initializeEagerServices, registerDependencies } from './config/index.js';
import { INTERNAL_CONFIG } from './config/internal-config.js';
import { MEET_EDITION, SERVER_CORS_ORIGIN, SERVER_PORT, logEnvVars } from './environment.js';
import { initRequestContext, jsonSyntaxErrorHandler, setBaseUrlMiddleware } from './middlewares/index.js';
import {
	analyticsRouter,
	apiKeyRouter,
	authRouter,
	configRouter,
	internalMeetingRouter,
	internalRecordingRouter,
	internalRoomRouter,
	livekitWebhookRouter,
	recordingRouter,
	roomRouter,
	userRouter
} from './routes/index.js';
import {
	frontendDirectoryPath,
	frontendHtmlPath,
	internalApiHtmlFilePath,
	publicApiHtmlFilePath,
	webcomponentBundlePath
} from './utils/path.utils.js';

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
	app.use(express.static(frontendDirectoryPath));

	app.set('trust proxy', true);
	app.use(express.json());
	app.use(jsonSyntaxErrorHandler);
	app.use(cookieParser());

	// CRITICAL: Initialize request context FIRST
	// This middleware creates an isolated AsyncLocalStorage context for each request
	// Must be registered before any middleware that uses RequestSessionService
	app.use(initRequestContext);

	// Middleware to set base URL for each request
	app.use(setBaseUrlMiddleware);

	// Public API routes
	app.use(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/docs`, (_req: Request, res: Response) =>
		res.sendFile(publicApiHtmlFilePath)
	);
	app.use(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms`, /*mediaTypeValidatorMiddleware,*/ roomRouter);
	app.use(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/recordings`, /*mediaTypeValidatorMiddleware,*/ recordingRouter);

	// Internal API routes
	if (process.env.NODE_ENV === 'development') {
		// Serve internal API docs only in development mode
		app.use(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/docs`, (_req: Request, res: Response) =>
			res.sendFile(internalApiHtmlFilePath)
		);
	}

	app.use(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/auth`, authRouter);
	app.use(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/api-keys`, apiKeyRouter);
	app.use(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/users`, userRouter);
	app.use(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/rooms`, internalRoomRouter);
	app.use(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/meetings`, internalMeetingRouter);
	app.use(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/recordings`, internalRecordingRouter);
	app.use(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/config`, configRouter);
	app.use(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/analytics`, analyticsRouter);

	app.use('/health', (_req: Request, res: Response) => res.status(200).send('OK'));

	// LiveKit Webhook route
	app.use('/livekit/webhook', livekitWebhookRouter);
	// Serve OpenVidu Meet webcomponent bundle file
	app.get('/v1/openvidu-meet.js', (_req: Request, res: Response) => res.sendFile(webcomponentBundlePath));
	// Serve OpenVidu Meet index.html file for all non-API routes
	app.get(/^(?!.*\/(api|internal-api)\/).*$/, (_req: Request, res: Response) => res.sendFile(frontendHtmlPath));
	// Catch all other routes and return 404
	app.use((_req: Request, res: Response) =>
		res.status(404).json({ error: 'Path Not Found', message: 'API path not implemented' })
	);

	return app;
};

const startServer = (app: express.Application) => {
	app.listen(SERVER_PORT, async () => {
		console.log(' ');
		console.log('---------------------------------------------------------');
		console.log(' ');
		console.log(`OpenVidu Meet ${MEET_EDITION} is listening on port`, chalk.cyanBright(SERVER_PORT));
		console.log(
			'REST API Docs: ',
			chalk.cyanBright(`http://localhost:${SERVER_PORT}${INTERNAL_CONFIG.API_BASE_PATH_V1}/docs`)
		);
		logEnvVars();
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
	await initializeEagerServices();
}

export { createApp, registerDependencies };
