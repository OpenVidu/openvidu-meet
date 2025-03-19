import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the source code
const srcPath = path.resolve(__dirname, '..');

const publicFilesPath = path.join(srcPath, '../public');
const webcomponentBundlePath = path.join(srcPath, '../public/webcomponent/openvidu-meet.bundle.min.js');
const indexHtmlPath = path.join(publicFilesPath, 'index.html');
const openapiHtmlPath = path.join(publicFilesPath, 'openapi', 'index.html');

export { srcPath, publicFilesPath, indexHtmlPath, webcomponentBundlePath, openapiHtmlPath };
