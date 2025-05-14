import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

/**
 * Determines if the current environment is development or production.
 * It checks the NODE_ENV environment variable to determine the environment.
 * @returns
 */
const isDevEnvironment = (): boolean => {
	const isDev = process.env.NODE_ENV === 'development';
	console.log('[PATH-UTILS] Environment:', isDev ? 'development' : 'production');
	return isDev;
};

/**
 * Gets the current directory of the module.
 * @returns The current directory of the module
 */
const getCurrentDir = (): string => {
	const __filename = fileURLToPath(import.meta.url);
	const __dirname = path.dirname(__filename);
	console.log('[PATH-UTILS] Current directory:', __dirname);
	return __dirname;
};

/**
 * Gets the project root directory based on the current directory and environment.
 * It first tries to resolve the project root based on the environment (development or production).
 * If the public folder is not found in the expected location, it tries to find it in an alternative location.
 * @param isDev
 * @param currentDir
 * @returns
 */
const getProjectRoot = (isDev: boolean, currentDir: string): string => {
	// Find the project root directory using NODE_ENV
	let projectRoot = isDev ? path.resolve(currentDir, '../../../backend') : path.resolve(currentDir, '../..');

	// Check if the public folder exists in the expected location
	const publicPath = path.join(projectRoot, 'public');

	if (!fs.existsSync(publicPath)) {
		console.log('[PATH-UTILS] Public path not found at primary location:', publicPath);

		// Try to find the project root in an alternative location
		projectRoot = isDev ? path.resolve(currentDir, '../..') : path.resolve(currentDir, '../../../');

		console.log('[PATH-UTILS] Trying alternative project root:', projectRoot);
	}

	return projectRoot;
};

/**
 * Verifies if a given path exists and logs the result.
 * @param pathToVerify
 * @param description
 */
const verifyPathExists = (pathToVerify: string, description: string): void => {
	const exists = fs.existsSync(pathToVerify);
	console.log(`[PATH-UTILS] ${description}: ${pathToVerify} (${exists ? 'EXISTS' : 'MISSING'})`);

	if (!exists) {
		console.warn(`[PATH-UTILS] WARNING: ${description} not found at ${pathToVerify}`);
	}
};

console.log('---------------------------------------------------------');
console.log('[PATH-UTILS] Initializing path utilities...');
// Initialize the path utilities
const isDev = isDevEnvironment();
const currentDir = getCurrentDir();
const projectRoot = getProjectRoot(isDev, currentDir);

// Export the paths for public files and webcomponent bundle
export const publicFilesPath = path.join(projectRoot, 'public');
export const webcomponentBundlePath = path.join(publicFilesPath, 'webcomponent/openvidu-meet.bundle.min.js');
export const indexHtmlPath = path.join(publicFilesPath, 'index.html');
export const publicApiHtmlFilePath = path.join(publicFilesPath, 'openapi', 'public.html');
export const internalApiHtmlFilePath = path.join(publicFilesPath, 'openapi', 'internal.html');

// Verify the existence of the paths
console.log('[PATH-UTILS] Project root resolved to:', projectRoot);
verifyPathExists(publicFilesPath, 'Public files directory');
verifyPathExists(webcomponentBundlePath, 'Webcomponent bundle');
verifyPathExists(indexHtmlPath, 'Index HTML file');
verifyPathExists(publicApiHtmlFilePath, 'Public API documentation');
verifyPathExists(internalApiHtmlFilePath, 'Internal API documentation');
console.log('---------------------------------------------------------');
console.log('');
