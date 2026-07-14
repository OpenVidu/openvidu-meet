import crypto from 'crypto';
import fs from 'fs';

/**
 * Cross-origin access for the ESM bundle served at
 * `<basePath>/v1/openvidu-meet.esm.js`. The loader is a classic `<script src>`
 * (no CORS), but importing the ESM bundle via `import()` — the loader does this,
 * and so can a host app on another origin — requires the module response to be
 * CORS-enabled. The bundle is public, credential-free static JS
 * (like any CDN-hosted module), so a wildcard origin is both correct and safe.
 */
export const WEBCOMPONENT_BUNDLE_ALLOW_ORIGIN = '*';

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

// One cached ETag per bundle file (the loader and the ESM are separate paths).
const cachedEtags = new Map<string, CachedBundleEtag>();

const SHA256_HEX = /^[a-f0-9]{64}$/i;

/**
 * Reads the precomputed content hash from the `<bundlePath>.sha256` sidecar
 * written by the deploy step (a 64-byte read), but only when the sidecar is at
 * least as new as the bundle. A sidecar older than the bundle is stale (e.g. read
 * mid-deploy, between the bundle rename and the sidecar write), so we recompute.
 */
const readSidecarHash = (bundlePath: string, bundleMtimeMs: number): string | null => {
	const sidecarPath = `${bundlePath}.sha256`;

	try {
		if (fs.statSync(sidecarPath).mtimeMs < bundleMtimeMs) {
			return null;
		}

		const hash = fs.readFileSync(sidecarPath, 'utf8').trim().split(/\s+/)[0];

		return SHA256_HEX.test(hash) ? hash : null;
	} catch {
		return null;
	}
};

/** Hashes the bundle file directly — the fallback when no valid sidecar exists. */
const hashFile = (bundlePath: string): string | null => {
	try {
		return crypto.createHash('sha256').update(fs.readFileSync(bundlePath)).digest('hex');
	} catch {
		return null;
	}
};

/**
 * Returns the current strong ETag for the given WebComponent bundle file, or
 * `null` when the file cannot be read. Each path is hashed and cached
 * independently (the loader and the ESM bundle each get their own entry).
 *
 * On a cache miss the hash comes from the `<bundle>.sha256` sidecar when present
 * and current, avoiding a synchronous SHA-256 over the multi-MB bundle on the
 * event loop; it falls back to hashing the file directly for dev / manual builds
 * that have no sidecar, preserving the previous behaviour.
 */
export const getWebcomponentBundleEtag = (bundlePath: string): string | null => {
	let stats: fs.Stats;

	try {
		stats = fs.statSync(bundlePath);
	} catch {
		return null;
	}

	const cached = cachedEtags.get(bundlePath);

	if (cached && cached.mtimeMs === stats.mtimeMs && cached.size === stats.size) {
		return cached.etag;
	}

	const hash = readSidecarHash(bundlePath, stats.mtimeMs) ?? hashFile(bundlePath);

	if (!hash) {
		return null;
	}

	const etag = `"${hash}"`;
	cachedEtags.set(bundlePath, { etag, mtimeMs: stats.mtimeMs, size: stats.size });

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
