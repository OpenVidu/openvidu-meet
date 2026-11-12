import type { RequestHandler, Response } from 'express';
import express from 'express';
import path from 'path';

const CONTENT_HASHED_BUILD_FILE = /-[\w-]{8}\.(?:js|css)$/;
const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/**
 * The Angular build names the bundles at the root of the directory after a hash of their content, so a browser
 * keeps them without revalidating. Every other file keeps its name across builds and is revalidated.
 */
export const serveFrontendFiles = (directory: string): RequestHandler =>
	express.static(directory, {
		index: false,
		setHeaders: (res: Response, filePath: string) => {
			if (path.dirname(filePath) === directory && CONTENT_HASHED_BUILD_FILE.test(filePath)) {
				res.setHeader('Cache-Control', IMMUTABLE_CACHE_CONTROL);
			}
		}
	});
