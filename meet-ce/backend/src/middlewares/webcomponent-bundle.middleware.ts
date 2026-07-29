import type { Request, RequestHandler, Response } from 'express';
import {
	getWebcomponentBundleEtag,
	matchesIfNoneMatch,
	WEBCOMPONENT_BUNDLE_CACHE_CONTROL
} from '../utils/webcomponent-bundle.utils.js';

/**
 * Serves an OpenVidu Meet WebComponent bundle from a STABLE url so host apps
 * auto-update to a freshly deployed version without redeploying themselves.
 * `no-cache` makes the browser revalidate BEFORE using the cached copy, so
 * every load runs the current version (no stale window vs. the backend); the
 * content-hash ETag keeps it cheap — a 304 with no body while unchanged, a 200
 * with the new bundle on the first load after a redeploy. See
 * webcomponent-bundle.utils.
 */
export const serveWebcomponentBundle =
	(bundlePath: string, allowOrigin?: string): RequestHandler =>
	(req: Request, res: Response) => {
		const etag = getWebcomponentBundleEtag(bundlePath);

		res.set('Cache-Control', WEBCOMPONENT_BUNDLE_CACHE_CONTROL);

		if (allowOrigin) {
			res.set('Access-Control-Allow-Origin', allowOrigin);
		}

		if (etag) {
			res.set('ETag', etag);

			if (matchesIfNoneMatch(req.headers['if-none-match'], etag)) {
				res.status(304).end();
				return;
			}
		}

		res.sendFile(bundlePath, { etag: false, cacheControl: false, lastModified: false });
	};
