import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the source code
const srcPath = path.resolve(__dirname, '..');

export const publicFilesPath = path.join(srcPath, '../public');
export const webcomponentBundlePath = path.join(srcPath, '../public/webcomponent/openvidu-meet.bundle.min.js');
export const indexHtmlPath = path.join(publicFilesPath, 'index.html');
export const publicApiHtmlFilePath = path.join(publicFilesPath, 'openapi', 'public.html');
export const internalApiHtmlFilePath = path.join(publicFilesPath, 'openapi', 'internal.html');
