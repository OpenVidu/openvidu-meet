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
export const MEET_ENV = {
	SERVER_PORT: process.env.SERVER_PORT || '6080',
	SERVER_CORS_ORIGIN: process.env.SERVER_CORS_ORIGIN || '*',
	LOG_LEVEL: process.env.MEET_LOG_LEVEL || 'info',
	NAME_ID: process.env.MEET_NAME_ID || 'openviduMeet',
	BASE_URL: process.env.MEET_BASE_URL || '',
	EDITION: process.env.MEET_EDITION || 'CE',

	// Authentication configuration
	INITIAL_ADMIN_USER: process.env.MEET_INITIAL_ADMIN_USER || 'admin',
	INITIAL_ADMIN_PASSWORD: process.env.MEET_INITIAL_ADMIN_PASSWORD || 'admin',
	INITIAL_API_KEY: process.env.MEET_INITIAL_API_KEY || '',

	// Webhook configuration
	INITIAL_WEBHOOK_ENABLED: process.env.MEET_INITIAL_WEBHOOK_ENABLED || 'false',
	INITIAL_WEBHOOK_URL: process.env.MEET_INITIAL_WEBHOOK_URL || '',

	// LiveKit configuration
	LIVEKIT_URL: process.env.LIVEKIT_URL || 'ws://localhost:7880',
	LIVEKIT_URL_PRIVATE: process.env.LIVEKIT_URL_PRIVATE || process.env.LIVEKIT_URL || 'ws://localhost:7880',
	LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY || 'devkey',
	LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET || 'secret',

	// MongoDB configuration
	MONGO_ENABLED: process.env.MEET_MONGO_ENABLED || 'true',
	MONGO_URI: process.env.MEET_MONGO_URI || '',
	MONGO_NODES: process.env.MEET_MONGO_NODES || 'localhost',
	MONGO_PORT: process.env.MEET_MONGO_PORT || '27017',
	MONGO_ADMIN_USERNAME: process.env.MEET_MONGO_ADMIN_USERNAME || 'mongoadmin',
	MONGO_ADMIN_PASSWORD: process.env.MEET_MONGO_ADMIN_PASSWORD || 'mongoadmin',
	MONGO_REPLICA_SET_NAME: process.env.MEET_MONGO_REPLICA_SET_NAME || 'rs0',
	MONGO_DB_NAME: process.env.MEET_MONGO_DB_NAME || 'openvidu-meet',

	BLOB_STORAGE_MODE: process.env.MEET_BLOB_STORAGE_MODE || 's3', // Options: 's3', 'abs', 'gcs'

	// S3 or GCS configuration
	S3_BUCKET: process.env.MEET_S3_BUCKET || 'openvidu-appdata',
	S3_SUBBUCKET: process.env.MEET_S3_SUBBUCKET || 'openvidu-meet',
	S3_SERVICE_ENDPOINT: process.env.MEET_S3_SERVICE_ENDPOINT || 'http://localhost:9000',
	S3_ACCESS_KEY: process.env.MEET_S3_ACCESS_KEY || 'minioadmin',
	S3_SECRET_KEY: process.env.MEET_S3_SECRET_KEY || 'minioadmin',
	AWS_REGION: process.env.MEET_AWS_REGION || 'us-east-1',
	S3_WITH_PATH_STYLE_ACCESS: process.env.MEET_S3_WITH_PATH_STYLE_ACCESS || 'true',

	// Azure Blob storage configuration
	AZURE_CONTAINER_NAME: process.env.MEET_AZURE_CONTAINER_NAME || 'openvidu-appdata',
	AZURE_SUBCONTAINER_NAME: process.env.MEET_AZURE_SUBCONTAINER_NAME || 'openvidu-meet',
	AZURE_ACCOUNT_NAME: process.env.MEET_AZURE_ACCOUNT_NAME || '',
	AZURE_ACCOUNT_KEY: process.env.MEET_AZURE_ACCOUNT_KEY || '',

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

export function checkModuleEnabled() {
	if (MEET_ENV.MODULES_FILE) {
		const moduleName = MEET_ENV.MODULE_NAME;
		const enabledModules = MEET_ENV.ENABLED_MODULES.split(',').map((module) => module.trim());

		if (!enabledModules.includes(moduleName)) {
			console.error(`Module ${moduleName} is not enabled`);
			process.exit(0);
		}
	}

	// If MongoDB is not enabled, exit the process
	if (MEET_ENV.MONGO_ENABLED.toLowerCase() !== 'true') {
		console.error('MongoDB integration is not enabled. Exiting the process.');
		process.exit(0);
	}
}

export const logEnvVars = () => {
	const credential = chalk.yellow;
	const text = chalk.cyanBright;

	console.log(' ');
	console.log('---------------------------------------------------------');
	console.log(`OpenVidu Meet ${MEET_ENV.EDITION} Server Configuration`);
	console.log('---------------------------------------------------------');
	console.log('SERVICE NAME ID: ', text(MEET_ENV.NAME_ID));
	console.log('CORS ORIGIN:', text(MEET_ENV.SERVER_CORS_ORIGIN));
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
