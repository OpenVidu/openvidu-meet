import { fileURLToPath } from 'url';
import path from 'path';
import * as fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the source code
const srcPath = path.resolve(__dirname, '..');

const publicFilesPath = path.join(srcPath, '../public');
const webcomponentBundlePath = path.join(srcPath, '../public/webcomponent/openvidu-meet.bundle.min.js');
const indexHtmlPath = path.join(publicFilesPath, 'index.html');

const getOpenApiSpecPath = () => {
	const prodPath = path.join('dist', 'openapi', 'openvidu-meet-api.yaml');
	const devPath = path.join(process.cwd(), 'openapi', 'openvidu-meet-api.yaml');

	if (fs.existsSync(prodPath)) {
		return prodPath;
	} else if (fs.existsSync(devPath)) {
		return devPath;
	} else {
		console.warn(`OpenAPI spec not found in ${prodPath} or ${devPath}`);
		throw new Error(`OpenAPI spec not found in ${prodPath} or ${devPath}`);
	}
};

export { srcPath, publicFilesPath, indexHtmlPath, webcomponentBundlePath, getOpenApiSpecPath };
