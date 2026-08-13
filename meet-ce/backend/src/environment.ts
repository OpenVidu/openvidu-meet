import chalk from 'chalk';
import dotenv from 'dotenv';
import type { StringValue } from 'ms';

let envPath: string | undefined;

if (process.env.MEET_CONFIG_DIR) {
	envPath = process.env.MEET_CONFIG_DIR;
} else if (process.env.NODE_ENV === 'development') {
	envPath = '.env.dev';
} else if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'ci') {
	envPath = '.env.test';
} else {
	envPath = undefined;
}

dotenv.config({ quiet: true, ...(envPath ? { path: envPath } : {}) });

// Extract environment variables with defaults
export const MEET_ENV = {
	SERVER_PORT: process.env.SERVER_PORT || '6080',
	SERVER_CORS_ORIGIN: process.env.SERVER_CORS_ORIGIN || '*',
	SERVER_TRUST_PROXY: process.env.SERVER_TRUST_PROXY || 'true',
	LOG_LEVEL: process.env.MEET_LOG_LEVEL || 'info',
	NAME_ID: process.env.MEET_NAME_ID || 'openviduMeet',
	BASE_URL: process.env.MEET_BASE_URL ?? '',
	BASE_PATH: process.env.MEET_BASE_PATH || '/meet',
	EDITION: process.env.MEET_EDITION || 'CE',

	// Authentication configuration
	INITIAL_ADMIN_USER: process.env.MEET_INITIAL_ADMIN_USER || 'admin',
	INITIAL_ADMIN_PASSWORD: process.env.MEET_INITIAL_ADMIN_PASSWORD || 'admin',
	INITIAL_API_KEY: process.env.MEET_INITIAL_API_KEY ?? '',
	ACCESS_TOKEN_EXPIRATION: (process.env.MEET_ACCESS_TOKEN_EXPIRATION || '2h') as StringValue,
	REFRESH_TOKEN_EXPIRATION: (process.env.MEET_REFRESH_TOKEN_EXPIRATION || '1d') as StringValue,
	ROOM_MEMBER_TOKEN_EXPIRATION: (process.env.MEET_ROOM_MEMBER_TOKEN_EXPIRATION || '2h') as StringValue,
	PASSWORD_CHANGE_TOKEN_EXPIRATION: (process.env.MEET_PASSWORD_CHANGE_TOKEN_EXPIRATION || '15m') as StringValue,
	REFRESH_TOKEN_ROTATION_ENABLED: process.env.MEET_REFRESH_TOKEN_ROTATION_ENABLED || 'true',

	// Webhook configuration
	INITIAL_WEBHOOK_ENABLED: process.env.MEET_INITIAL_WEBHOOK_ENABLED || 'false',
	INITIAL_WEBHOOK_URL: process.env.MEET_INITIAL_WEBHOOK_URL ?? '',

	// LiveKit configuration
	LIVEKIT_URL: process.env.LIVEKIT_URL ?? 'ws://localhost:7880',
	LIVEKIT_URL_PRIVATE: process.env.LIVEKIT_URL_PRIVATE ?? process.env.LIVEKIT_URL ?? 'ws://localhost:7880',
	LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY ?? 'devkey',
	LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET ?? 'secret',

	// MongoDB configuration
	MONGO_ENABLED: process.env.MEET_MONGO_ENABLED || 'true',
	MONGO_URI: process.env.MEET_MONGO_URI ?? '',
	MONGO_NODES: process.env.MEET_MONGO_NODES ?? 'localhost',
	MONGO_PORT: process.env.MEET_MONGO_PORT ?? '27017',
	MONGO_ADMIN_USERNAME: process.env.MEET_MONGO_ADMIN_USERNAME ?? 'mongoadmin',
	MONGO_ADMIN_PASSWORD: process.env.MEET_MONGO_ADMIN_PASSWORD ?? 'mongoadmin',
	MONGO_REPLICA_SET_NAME: process.env.MEET_MONGO_REPLICA_SET_NAME ?? 'rs0',
	MONGO_DB_NAME: process.env.MEET_MONGO_DB_NAME ?? 'openvidu-meet',
	// pool configuration
	MONGO_MAX_POOL_SIZE: parseInt(process.env.MEET_MONGO_MAX_POOL_SIZE ?? '100', 10),
	MONGO_MIN_POOL_SIZE: parseInt(process.env.MEET_MONGO_MIN_POOL_SIZE ?? '0', 10),
	// connection timeouts
	MONGO_SERVER_SELECTION_TIMEOUT_MS: parseInt(process.env.MEET_MONGO_SERVER_SELECTION_TIMEOUT_MS ?? '30000', 10),
	MONGO_CONNECT_TIMEOUT_MS: parseInt(process.env.MEET_MONGO_CONNECT_TIMEOUT_MS ?? '30000', 10),
	MONGO_SOCKET_TIMEOUT_MS: parseInt(process.env.MEET_MONGO_SOCKET_TIMEOUT_MS ?? '0', 10),
	MONGO_MAX_IDLE_TIME_MS: parseInt(process.env.MEET_MONGO_MAX_IDLE_TIME_MS ?? '0', 10),

	BLOB_STORAGE_MODE: process.env.MEET_BLOB_STORAGE_MODE || 's3', // Options: 's3', 'abs', 'gcs'

	// S3 or GCS configuration
	S3_BUCKET: process.env.MEET_S3_BUCKET ?? 'openvidu-appdata',
	S3_SUBBUCKET: process.env.MEET_S3_SUBBUCKET ?? 'openvidu-meet',
	S3_SERVICE_ENDPOINT: process.env.MEET_S3_SERVICE_ENDPOINT ?? 'http://localhost:9000',
	S3_ACCESS_KEY: process.env.MEET_S3_ACCESS_KEY ?? 'minioadmin',
	S3_SECRET_KEY: process.env.MEET_S3_SECRET_KEY ?? 'minioadmin',
	AWS_REGION: process.env.MEET_AWS_REGION ?? 'us-east-1',
	S3_WITH_PATH_STYLE_ACCESS: process.env.MEET_S3_WITH_PATH_STYLE_ACCESS ?? 'true',

	// S3 Server-Side Encryption configuration.
	// Type must be either "SSE-S3" or "SSE-KMS". When Type is "SSE-KMS", KMS_KEY_ID is required.
	// KMS_ENCRYPTION_CONTEXT, if set, must be a valid JSON object and is only used with "SSE-KMS".
	S3_SSE_TYPE: process.env.MEET_S3_SSE_TYPE ?? '',
	S3_SSE_KMS_KEY_ID: process.env.MEET_S3_SSE_KMS_KEY_ID ?? '',
	S3_SSE_KMS_ENCRYPTION_CONTEXT: process.env.MEET_S3_SSE_KMS_ENCRYPTION_CONTEXT ?? '',

	// Azure Blob storage configuration
	AZURE_CONTAINER_NAME: process.env.MEET_AZURE_CONTAINER_NAME ?? 'openvidu-appdata',
	AZURE_SUBCONTAINER_NAME: process.env.MEET_AZURE_SUBCONTAINER_NAME ?? 'openvidu-meet',
	AZURE_ACCOUNT_NAME: process.env.MEET_AZURE_ACCOUNT_NAME ?? '',
	AZURE_ACCOUNT_KEY: process.env.MEET_AZURE_ACCOUNT_KEY ?? '',

	// Redis configuration
	REDIS_HOST: process.env.MEET_REDIS_HOST ?? 'localhost',
	REDIS_PORT: process.env.MEET_REDIS_PORT ?? '6379',
	REDIS_USERNAME: process.env.MEET_REDIS_USERNAME ?? '',
	REDIS_PASSWORD: process.env.MEET_REDIS_PASSWORD ?? 'redispassword',
	REDIS_DB: process.env.MEET_REDIS_DB ?? '0',

	// Redis Sentinel configuration
	REDIS_SENTINEL_HOST_LIST: process.env.MEET_REDIS_SENTINEL_HOST_LIST ?? '',
	REDIS_SENTINEL_PASSWORD: process.env.MEET_REDIS_SENTINEL_PASSWORD ?? '',
	REDIS_SENTINEL_MASTER_NAME: process.env.MEET_REDIS_SENTINEL_MASTER_NAME ?? 'openvidu',

	// Live Captions configuration
	CAPTIONS_ENABLED: process.env.MEET_CAPTIONS_ENABLED || 'false',

	// Deployment configuration
	MODULES_FILE: process.env.MODULES_FILE || undefined,
	MODULE_NAME: process.env.MODULE_NAME || 'openviduMeet',
	ENABLED_MODULES: process.env.ENABLED_MODULES ?? ''
};

/**
 * Valid values of the `MEET_MODE` deployment variable, which selects the permission-name surface the
 * REST API (and webhooks) expose:
 *
 * - `'compatibility'` (default) — both worlds at once: requests accept the deprecated `can*` keys,
 *   the current `moduleAbility` keys, or a mix (a contradiction between a deprecated key and its
 *   replacement is a 422), and responses/webhooks carry **both** key sets so integrations can
 *   migrate endpoint by endpoint.
 * - `'3.9.0'` — the new API only: responses/webhooks carry only the current keys, and a request
 *   using a deprecated key is rejected with a 422 naming its replacement.
 *
 * The `compatibility` mode is removed in 3.12.0 together with the deprecated names.
 */
export const MEET_API_MODES = ['compatibility', '3.9.0'] as const;

export type MeetApiMode = (typeof MEET_API_MODES)[number];

/**
 * Resolves the current {@link MeetApiMode}. Reads `process.env` on every call instead of being
 * frozen into {@link MEET_ENV}: the value never changes in production, but tests exercise both modes
 * against one in-process app by flipping `process.env.MEET_MODE` between suites. An invalid value
 * resolves to `compatibility` here; {@link validateMeetMode} makes that a boot-time failure instead
 * of a silent fallback.
 */
export const getMeetMode = (): MeetApiMode => {
	return process.env.MEET_MODE?.trim() === '3.9.0' ? '3.9.0' : 'compatibility';
};

/**
 * Whether the deployment still exposes the deprecated permission-name surface (see
 * {@link MEET_API_MODES}).
 */
export const isCompatibilityMode = (): boolean => {
	return getMeetMode() === 'compatibility';
};

/**
 * Fails fast at boot on a MEET_MODE typo: silently running in `compatibility` when the operator
 * asked for `3.9.0` (or mistyped it) would quietly expose the API surface they meant to turn off.
 */
export const validateMeetMode = (): void => {
	const raw = process.env.MEET_MODE?.trim();

	if (raw && !MEET_API_MODES.includes(raw as MeetApiMode)) {
		console.error(
			`Invalid MEET_MODE '${raw}'. Valid values: ${MEET_API_MODES.map((mode) => `'${mode}'`).join(', ')}. Exiting.`
		);
		process.exit(1);
	}
};

export const checkModuleEnabled = () => {
	if (MEET_ENV.MODULES_FILE) {
		const moduleName = MEET_ENV.MODULE_NAME;
		const enabledModules = MEET_ENV.ENABLED_MODULES.split(',').map((module) => module.trim());

		if (!enabledModules.includes(moduleName)) {
			console.warn(`Module '${moduleName}' is not enabled. Exiting.`);
			process.exit(0);
		}
	}

	// If MongoDB is not enabled, exit the process
	if (MEET_ENV.MONGO_ENABLED.toLowerCase() !== 'true') {
		console.warn('MongoDB integration is not enabled. Exiting.');
		process.exit(0);
	}
};

export const logEnvVars = () => {
	const credential = chalk.yellow;
	const text = chalk.cyanBright;

	console.log(' ');
	console.log('---------------------------------------------------------');
	console.log(`OpenVidu Meet ${MEET_ENV.EDITION} Server Configuration`);
	console.log('---------------------------------------------------------');
	console.log('SERVICE NAME ID: ', text(MEET_ENV.NAME_ID));
	console.log('MEET MODE: ', text(getMeetMode()));
	console.log('CORS ORIGIN:', text(MEET_ENV.SERVER_CORS_ORIGIN));
	console.log('TRUST PROXY:', text(MEET_ENV.SERVER_TRUST_PROXY));
	console.log('LOG LEVEL: ', text(MEET_ENV.LOG_LEVEL));
	console.log('BLOB STORAGE MODE:', text(MEET_ENV.BLOB_STORAGE_MODE));
	console.log('INITIAL ADMIN USER: ', credential('****' + MEET_ENV.INITIAL_ADMIN_USER.slice(-3)));
	console.log('INITIAL ADMIN PASSWORD: ', credential('****' + MEET_ENV.INITIAL_ADMIN_PASSWORD.slice(-3)));

	if (!MEET_ENV.INITIAL_API_KEY) {
		console.log(chalk.red('INITIAL API KEY: none'));
	} else {
		console.log('INITIAL API KEY: ', credential('****' + MEET_ENV.INITIAL_API_KEY.slice(-3)));
	}

	console.log('INITIAL WEBHOOK ENABLED:', text(MEET_ENV.INITIAL_WEBHOOK_ENABLED));

	if (MEET_ENV.INITIAL_WEBHOOK_ENABLED === 'true') {
		console.log('INITIAL WEBHOOK URL:', text(MEET_ENV.INITIAL_WEBHOOK_URL));
	}

	console.log('---------------------------------------------------------');
	console.log('LIVEKIT Configuration');
	console.log('---------------------------------------------------------');
	console.log('LIVEKIT URL: ', text(MEET_ENV.LIVEKIT_URL));
	console.log('LIVEKIT URL PRIVATE: ', text(MEET_ENV.LIVEKIT_URL_PRIVATE));
	console.log('LIVEKIT API SECRET: ', credential('****' + MEET_ENV.LIVEKIT_API_SECRET.slice(-3)));
	console.log('LIVEKIT API KEY: ', credential('****' + MEET_ENV.LIVEKIT_API_KEY.slice(-3)));
	console.log('---------------------------------------------------------');

	if (MEET_ENV.MONGO_URI === '') {
		console.log('MongoDB Configuration');
		console.log('---------------------------------------------------------');
		console.log('MONGODB NODES: ', text(MEET_ENV.MONGO_NODES));
		console.log('MONGODB PORT: ', text(MEET_ENV.MONGO_PORT));
		console.log('MONGODB ADMIN USERNAME: ', credential('****' + MEET_ENV.MONGO_ADMIN_USERNAME.slice(-3)));
		console.log('MONGODB ADMIN PASSWORD: ', credential('****' + MEET_ENV.MONGO_ADMIN_PASSWORD.slice(-3)));
		console.log('MONGODB REPLICA SET NAME: ', text(MEET_ENV.MONGO_REPLICA_SET_NAME));
		console.log('MONGODB DB NAME: ', text(MEET_ENV.MONGO_DB_NAME));
		console.log('---------------------------------------------------------');
	}

	if (MEET_ENV.BLOB_STORAGE_MODE === 's3') {
		console.log('S3 Configuration');
		console.log('---------------------------------------------------------');
		console.log('S3 BUCKET:', text(MEET_ENV.S3_BUCKET));
		console.log('S3 SERVICE ENDPOINT:', text(MEET_ENV.S3_SERVICE_ENDPOINT));
		console.log('S3 ACCESS KEY:', credential('****' + MEET_ENV.S3_ACCESS_KEY.slice(-3)));
		console.log('S3 SECRET KEY:', credential('****' + MEET_ENV.S3_SECRET_KEY.slice(-3)));
		console.log('AWS REGION:', text(MEET_ENV.AWS_REGION));
		console.log('S3 WITH PATH STYLE ACCESS:', text(MEET_ENV.S3_WITH_PATH_STYLE_ACCESS));

		if (MEET_ENV.S3_SSE_TYPE) {
			console.log('S3 SSE TYPE:', text(MEET_ENV.S3_SSE_TYPE));

			if (MEET_ENV.S3_SSE_KMS_KEY_ID) {
				console.log('S3 SSE KMS KEY ID:', credential('****' + MEET_ENV.S3_SSE_KMS_KEY_ID.slice(-3)));
			}

			if (MEET_ENV.S3_SSE_KMS_ENCRYPTION_CONTEXT) {
				console.log('S3 SSE KMS ENCRYPTION CONTEXT: <set>');
			}
		}

		console.log('---------------------------------------------------------');
	} else if (MEET_ENV.BLOB_STORAGE_MODE === 'abs') {
		console.log('Azure Blob Storage Configuration');
		console.log('---------------------------------------------------------');
		console.log('AZURE ACCOUNT NAME:', text(MEET_ENV.AZURE_ACCOUNT_NAME));
		console.log('AZURE ACCOUNT KEY:', credential('****' + MEET_ENV.AZURE_ACCOUNT_KEY.slice(-3)));
		console.log('AZURE CONTAINER NAME:', text(MEET_ENV.AZURE_CONTAINER_NAME));
		console.log('---------------------------------------------------------');
	} else if (MEET_ENV.BLOB_STORAGE_MODE === 'gcs') {
		console.log('GCS Configuration');
		console.log('---------------------------------------------------------');
		console.log('GCS BUCKET:', text(MEET_ENV.S3_BUCKET));
		console.log('---------------------------------------------------------');
	}

	console.log('Redis Configuration');
	console.log('---------------------------------------------------------');
	console.log('REDIS HOST:', text(MEET_ENV.REDIS_HOST));
	console.log('REDIS PORT:', text(MEET_ENV.REDIS_PORT));
	console.log('REDIS USERNAME:', credential('****' + MEET_ENV.REDIS_USERNAME.slice(-3)));
	console.log('REDIS PASSWORD:', credential('****' + MEET_ENV.REDIS_PASSWORD.slice(-3)));

	if (MEET_ENV.REDIS_SENTINEL_HOST_LIST !== '') {
		console.log('REDIS SENTINEL IS ENABLED');
		console.log('REDIS SENTINEL HOST LIST:', text(MEET_ENV.REDIS_SENTINEL_HOST_LIST));
	}

	console.log('---------------------------------------------------------');
	console.log(' ');
};
