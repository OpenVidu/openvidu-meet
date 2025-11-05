import chalk from 'chalk';
import dotenv from 'dotenv';

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

dotenv.config(envPath ? { path: envPath } : {});

// Extract environment variables with defaults
const envVars = {
	SERVER_PORT: process.env.SERVER_PORT || '6080',
	SERVER_CORS_ORIGIN: process.env.SERVER_CORS_ORIGIN || '*',
	MEET_LOG_LEVEL: process.env.MEET_LOG_LEVEL || 'info',
	MEET_NAME_ID: process.env.MEET_NAME_ID || 'openviduMeet',
	MEET_BASE_URL: process.env.MEET_BASE_URL || '',
	MEET_EDITION: process.env.MEET_EDITION || 'CE',

	// Authentication configuration
	MEET_INITIAL_ADMIN_USER: process.env.MEET_INITIAL_ADMIN_USER || 'admin',
	MEET_INITIAL_ADMIN_PASSWORD: process.env.MEET_INITIAL_ADMIN_PASSWORD || 'admin',
	MEET_INITIAL_API_KEY: process.env.MEET_INITIAL_API_KEY || '',

	// Webhook configuration
	MEET_INITIAL_WEBHOOK_ENABLED: process.env.MEET_INITIAL_WEBHOOK_ENABLED || 'false',
	MEET_INITIAL_WEBHOOK_URL: process.env.MEET_INITIAL_WEBHOOK_URL || '',

	// LiveKit configuration
	LIVEKIT_URL: process.env.LIVEKIT_URL || 'ws://localhost:7880',
	LIVEKIT_URL_PRIVATE: process.env.LIVEKIT_URL_PRIVATE || process.env.LIVEKIT_URL || 'ws://localhost:7880',
	LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY || 'devkey',
	LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET || 'secret',

	// MongoDB configuration
	MEET_MONGO_ENABLED: process.env.MEET_MONGO_ENABLED || 'true',
	MEET_MONGO_URI: process.env.MEET_MONGO_URI || '',
	MEET_MONGO_NODES: process.env.MEET_MONGO_NODES || 'localhost',
	MEET_MONGO_PORT: process.env.MEET_MONGO_PORT || '27017',
	MEET_MONGO_ADMIN_USERNAME: process.env.MEET_MONGO_ADMIN_USERNAME || 'mongoadmin',
	MEET_MONGO_ADMIN_PASSWORD: process.env.MEET_MONGO_ADMIN_PASSWORD || 'mongoadmin',
	MEET_MONGO_REPLICA_SET_NAME: process.env.MEET_MONGO_REPLICA_SET_NAME || 'rs0',
	MEET_MONGO_DB_NAME: process.env.MEET_MONGO_DB_NAME || 'openvidu-meet',

	MEET_BLOB_STORAGE_MODE: process.env.MEET_BLOB_STORAGE_MODE || 's3', // Options: 's3', 'abs', 'gcs'

	// S3 or GCS configuration
	MEET_S3_BUCKET: process.env.MEET_S3_BUCKET || 'openvidu-appdata',
	MEET_S3_SUBBUCKET: process.env.MEET_S3_SUBBUCKET || 'openvidu-meet',
	MEET_S3_SERVICE_ENDPOINT: process.env.MEET_S3_SERVICE_ENDPOINT || 'http://localhost:9000',
	MEET_S3_ACCESS_KEY: process.env.MEET_S3_ACCESS_KEY || 'minioadmin',
	MEET_S3_SECRET_KEY: process.env.MEET_S3_SECRET_KEY || 'minioadmin',
	MEET_AWS_REGION: process.env.MEET_AWS_REGION || 'us-east-1',
	MEET_S3_WITH_PATH_STYLE_ACCESS: process.env.MEET_S3_WITH_PATH_STYLE_ACCESS || 'true',

	// Azure Blob storage configuration
	MEET_AZURE_CONTAINER_NAME: process.env.MEET_AZURE_CONTAINER_NAME || 'openvidu-appdata',
	MEET_AZURE_SUBCONTAINER_NAME: process.env.MEET_AZURE_SUBCONTAINER_NAME || 'openvidu-meet',
	MEET_AZURE_ACCOUNT_NAME: process.env.MEET_AZURE_ACCOUNT_NAME || '',
	MEET_AZURE_ACCOUNT_KEY: process.env.MEET_AZURE_ACCOUNT_KEY || '',

	// Redis configuration
	REDIS_HOST: process.env.MEET_REDIS_HOST || 'localhost',
	REDIS_PORT: process.env.MEET_REDIS_PORT || '6379',
	REDIS_USERNAME: process.env.MEET_REDIS_USERNAME || '',
	REDIS_PASSWORD: process.env.MEET_REDIS_PASSWORD || 'redispassword',
	REDIS_DB: process.env.MEET_REDIS_DB || '0',

	// Redis Sentinel configuration
	REDIS_SENTINEL_HOST_LIST: process.env.MEET_REDIS_SENTINEL_HOST_LIST || '',
	REDIS_SENTINEL_PASSWORD: process.env.MEET_REDIS_SENTINEL_PASSWORD || '',
	REDIS_SENTINEL_MASTER_NAME: process.env.MEET_REDIS_SENTINEL_MASTER_NAME || 'openvidu',

	// Deployment configuration
	MODULES_FILE: process.env.MODULES_FILE || undefined,
	MODULE_NAME: process.env.MODULE_NAME || 'openviduMeet',
	ENABLED_MODULES: process.env.ENABLED_MODULES || ''
};

// Export environment as an object for extensibility
export const environment = envVars;

/**
 * Helper function to create individual exports from an environment object.
 * This is used to maintain backward compatibility with code that imports individual variables.
 */
export const createEnvironmentExports = <T extends Record<string, unknown>>(env: T): T => {
	return env;
};

// Export individual variables for backward compatibility
export const {
	SERVER_PORT,
	SERVER_CORS_ORIGIN,
	MEET_LOG_LEVEL,
	MEET_NAME_ID,
	MEET_BASE_URL,
	MEET_EDITION,
	MEET_INITIAL_ADMIN_USER,
	MEET_INITIAL_ADMIN_PASSWORD,
	MEET_INITIAL_API_KEY,
	MEET_INITIAL_WEBHOOK_ENABLED,
	MEET_INITIAL_WEBHOOK_URL,
	LIVEKIT_URL,
	LIVEKIT_URL_PRIVATE,
	LIVEKIT_API_KEY,
	LIVEKIT_API_SECRET,
	MEET_MONGO_ENABLED,
	MEET_MONGO_URI,
	MEET_MONGO_NODES,
	MEET_MONGO_PORT,
	MEET_MONGO_ADMIN_USERNAME,
	MEET_MONGO_ADMIN_PASSWORD,
	MEET_MONGO_REPLICA_SET_NAME,
	MEET_MONGO_DB_NAME,
	MEET_BLOB_STORAGE_MODE,
	MEET_S3_BUCKET,
	MEET_S3_SUBBUCKET,
	MEET_S3_SERVICE_ENDPOINT,
	MEET_S3_ACCESS_KEY,
	MEET_S3_SECRET_KEY,
	MEET_AWS_REGION,
	MEET_S3_WITH_PATH_STYLE_ACCESS,
	MEET_AZURE_CONTAINER_NAME,
	MEET_AZURE_SUBCONTAINER_NAME,
	MEET_AZURE_ACCOUNT_NAME,
	MEET_AZURE_ACCOUNT_KEY,
	REDIS_HOST,
	REDIS_PORT,
	REDIS_USERNAME,
	REDIS_PASSWORD,
	REDIS_DB,
	REDIS_SENTINEL_HOST_LIST,
	REDIS_SENTINEL_PASSWORD,
	REDIS_SENTINEL_MASTER_NAME,
	MODULES_FILE,
	MODULE_NAME,
	ENABLED_MODULES
} = envVars;

export const getExportedEnvironment = () => {
	return { ...envVars };
};

export function checkModuleEnabled() {
	if (MODULES_FILE) {
		const moduleName = MODULE_NAME;
		const enabledModules = ENABLED_MODULES.split(',').map((module) => module.trim());

		if (!enabledModules.includes(moduleName)) {
			console.error(`Module ${moduleName} is not enabled`);
			process.exit(0);
		}
	}

	// If MongoDB is not enabled, exit the process
	if (environment.MEET_MONGO_ENABLED.toLowerCase() !== 'true') {
		console.error('MongoDB integration is not enabled. Exiting the process.');
		process.exit(0);
	}
}

export const logEnvVars = () => {
	const credential = chalk.yellow;
	const text = chalk.cyanBright;

	console.log(' ');
	console.log('---------------------------------------------------------');
	console.log(`OpenVidu Meet ${MEET_EDITION} Server Configuration`);
	console.log('---------------------------------------------------------');
	console.log('SERVICE NAME ID: ', text(MEET_NAME_ID));
	console.log('CORS ORIGIN:', text(SERVER_CORS_ORIGIN));
	console.log('MEET LOG LEVEL: ', text(MEET_LOG_LEVEL));
	console.log('MEET BLOB STORAGE MODE:', text(MEET_BLOB_STORAGE_MODE));
	console.log('MEET INITIAL ADMIN USER: ', credential('****' + MEET_INITIAL_ADMIN_USER.slice(-3)));
	console.log('MEET INITIAL ADMIN PASSWORD: ', credential('****' + MEET_INITIAL_ADMIN_PASSWORD.slice(-3)));

	if (!MEET_INITIAL_API_KEY) {
		console.log(chalk.red('MEET INITIAL API KEY: none'));
	} else {
		console.log('MEET INITIAL API KEY: ', credential('****' + MEET_INITIAL_API_KEY.slice(-3)));
	}

	console.log('MEET INITIAL WEBHOOK ENABLED:', text(MEET_INITIAL_WEBHOOK_ENABLED));

	if (MEET_INITIAL_WEBHOOK_ENABLED === 'true') {
		console.log('MEET INITIAL WEBHOOK URL:', text(MEET_INITIAL_WEBHOOK_URL));
	}

	console.log('---------------------------------------------------------');
	console.log('LIVEKIT Configuration');
	console.log('---------------------------------------------------------');
	console.log('LIVEKIT URL: ', text(LIVEKIT_URL));
	console.log('LIVEKIT URL PRIVATE: ', text(LIVEKIT_URL_PRIVATE));
	console.log('LIVEKIT API SECRET: ', credential('****' + LIVEKIT_API_SECRET.slice(-3)));
	console.log('LIVEKIT API KEY: ', credential('****' + LIVEKIT_API_KEY.slice(-3)));
	console.log('---------------------------------------------------------');

	if (MEET_MONGO_URI === '') {
		console.log('MongoDB Configuration');
		console.log('---------------------------------------------------------');
		console.log('MONGODB NODES: ', text(MEET_MONGO_NODES));
		console.log('MONGODB PORT: ', text(MEET_MONGO_PORT));
		console.log('MONGODB ADMIN USERNAME: ', credential('****' + MEET_MONGO_ADMIN_USERNAME.slice(-3)));
		console.log('MONGODB ADMIN PASSWORD: ', credential('****' + MEET_MONGO_ADMIN_PASSWORD.slice(-3)));
		console.log('MONGODB REPLICA SET NAME: ', text(MEET_MONGO_REPLICA_SET_NAME));
		console.log('MONGODB DB NAME: ', text(MEET_MONGO_DB_NAME));
		console.log('---------------------------------------------------------');
	}

	if (MEET_BLOB_STORAGE_MODE === 's3') {
		console.log('S3 Configuration');
		console.log('---------------------------------------------------------');
		console.log('MEET S3 BUCKET:', text(MEET_S3_BUCKET));
		console.log('MEET S3 SERVICE ENDPOINT:', text(MEET_S3_SERVICE_ENDPOINT));
		console.log('MEET S3 ACCESS KEY:', credential('****' + MEET_S3_ACCESS_KEY.slice(-3)));
		console.log('MEET S3 SECRET KEY:', credential('****' + MEET_S3_SECRET_KEY.slice(-3)));
		console.log('MEET AWS REGION:', text(MEET_AWS_REGION));
		console.log('MEET S3 WITH PATH STYLE ACCESS:', text(MEET_S3_WITH_PATH_STYLE_ACCESS));
		console.log('---------------------------------------------------------');
	} else if (MEET_BLOB_STORAGE_MODE === 'abs') {
		console.log('Azure Blob Storage Configuration');
		console.log('---------------------------------------------------------');
		console.log('MEET AZURE ACCOUNT NAME:', text(MEET_AZURE_ACCOUNT_NAME));
		console.log('MEET AZURE ACCOUNT KEY:', credential('****' + MEET_AZURE_ACCOUNT_KEY.slice(-3)));
		console.log('MEET AZURE CONTAINER NAME:', text(MEET_AZURE_CONTAINER_NAME));
		console.log('---------------------------------------------------------');
	} else if (MEET_BLOB_STORAGE_MODE === 'gcs') {
		console.log('GCS Configuration');
		console.log('---------------------------------------------------------');
		console.log('MEET GCS BUCKET:', text(MEET_S3_BUCKET));
		console.log('---------------------------------------------------------');
	}

	console.log('Redis Configuration');
	console.log('---------------------------------------------------------');
	console.log('REDIS HOST:', text(REDIS_HOST));
	console.log('REDIS PORT:', text(REDIS_PORT));
	console.log('REDIS USERNAME:', credential('****' + REDIS_USERNAME.slice(-3)));
	console.log('REDIS PASSWORD:', credential('****' + REDIS_PASSWORD.slice(-3)));

	if (REDIS_SENTINEL_HOST_LIST !== '') {
		console.log('REDIS SENTINEL IS ENABLED');
		console.log('REDIS SENTINEL HOST LIST:', text(REDIS_SENTINEL_HOST_LIST));
	}

	console.log('---------------------------------------------------------');
	console.log(' ');
};
