import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Find project root (assuming backend is always in <root>/backend)
const projectRoot = path.resolve(__dirname, '../../..');

export const publicFilesPath = path.join(projectRoot, 'backend/public');
export const webcomponentBundlePath = path.join(publicFilesPath, 'webcomponent/openvidu-meet.bundle.min.js');
export const indexHtmlPath = path.join(publicFilesPath, 'index.html');
export const publicApiHtmlFilePath = path.join(publicFilesPath, 'openapi', 'public.html');
export const internalApiHtmlFilePath = path.join(publicFilesPath, 'openapi', 'internal.html');
