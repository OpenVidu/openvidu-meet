import crypto from 'crypto';
import fs from 'fs';
import { webcomponentBundlePath } from './path.utils.js';

/**
 * Caching for the WebComponent bundle served at the STABLE url
 * `<basePath>/v1/openvidu-meet.js`. Host applications embed that url and must
 * automatically pick up a freshly deployed WebComponent version WITHOUT
 * redeploying themselves, while avoiding needless re-downloads of the ~4.6 MB
 * bundle.
 *
 * Two pieces work together (see the `/v1/openvidu-meet.js` route in server.ts):
 *
 *  - {@link getWebcomponentBundleEtag} — a STRONG, CONTENT-derived ETag. Using
 *    the file content (not mtime/size) means an identical rebuild does not bust
 *    client caches; it is cached and only recomputed when the bundle actually
 *    changes on disk (the redeploy step overwrites it while the server runs).
 *
 *  - {@link WEBCOMPONENT_BUNDLE_CACHE_CONTROL} — `no-cache`: the browser MUST
 *    revalidate the cached copy BEFORE using it on every load. The conditional
 *    request returns a cheap `304` (no body) while the bundle is unchanged, and
 *    a full `200` with the new bundle on the first load after a redeploy.
 *    Because the revalidation completes BEFORE the `<script>` executes, every
 *    page load runs the CURRENT version — zero-lag, with no window where a stale
 *    bundle could run against an already-updated backend.
 *
 *    We deliberately do NOT use `stale-while-revalidate` here: it would serve the
 *    cached bundle instantly and only update on the NEXT load, leaving the first
 *    post-deploy load running the previous WebComponent version against a
 *    possibly-updated backend (a version-skew risk). The price of `no-cache` is
 *    one revalidation round-trip per load (a 304 with no body) — the right trade
 *    for a component that must stay in lockstep with the backend.
 */
export const WEBCOMPONENT_BUNDLE_CACHE_CONTROL = 'no-cache';

interface CachedBundleEtag {
	etag: string;
	mtimeMs: number;
	size: number;
}

let cachedEtag: CachedBundleEtag | null = null;

/**
 * Returns the current strong ETag for the WebComponent bundle, or `null` when
 * the bundle file cannot be read.
 */
export const getWebcomponentBundleEtag = (): string | null => {
	let stats: fs.Stats;

	try {
		stats = fs.statSync(webcomponentBundlePath);
	} catch {
		return null;
	}

	if (cachedEtag && cachedEtag.mtimeMs === stats.mtimeMs && cachedEtag.size === stats.size) {
		return cachedEtag.etag;
	}

	const hash = crypto.createHash('sha256').update(fs.readFileSync(webcomponentBundlePath)).digest('hex');
	const etag = `"${hash}"`;
	cachedEtag = { etag, mtimeMs: stats.mtimeMs, size: stats.size };

	return etag;
};

/**
 * True when the request's `If-None-Match` header matches the given ETag, so the
 * route can answer `304 Not Modified` instead of resending the bundle body.
 */
export const matchesIfNoneMatch = (ifNoneMatch: string | undefined, etag: string): boolean => {
	if (!ifNoneMatch) {
		return false;
	}

	return ifNoneMatch
		.split(',')
		.map((value) => value.trim())
		.includes(etag);
};
