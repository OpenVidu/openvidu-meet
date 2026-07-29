import { afterAll, describe, expect, it } from '@jest/globals';
import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import { serveWebcomponentBundle } from '../../src/middlewares/webcomponent-bundle.middleware.js';

/**
 * HTTP-contract tests for the WebComponent bundle routes. Host applications
 * embed ONE stable url (`<basePath>/v1/openvidu-meet.js`) and rely on this
 * exact behaviour to pick up new WebComponent releases without rebuilding:
 *
 *  1. First load          → 200 with the FULL bundle body + a strong ETag.
 *  2. Reload, unchanged   → 304 with NO body (the cached copy is revalidated,
 *                           never re-downloaded).
 *  3. Redeploy, SAME name → 200 with the NEW bundle body and a NEW ETag, even
 *                           though the url and filename never changed.
 *
 * The routes here mirror the wiring in server.ts: the loader at
 * `/v1/openvidu-meet.js` (no CORS) and the ESM at `/v1/openvidu-meet.esm.js`
 * (CORS `*`, it is `import()`ed cross-origin).
 */
describe('webcomponent-bundle.middleware - serveWebcomponentBundle', () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ov-meet-wc-serve-'));
	let seq = 0;

	afterAll(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});

	const sha256 = (content: string): string => crypto.createHash('sha256').update(Buffer.from(content)).digest('hex');

	/**
	 * Writes a bundle exactly like deploy-to-backend.js does: bundle first, then
	 * the `<bundle>.sha256` sidecar (never older than the bundle). Each call uses
	 * a UNIQUE filename unless `file` is passed, because the ETag helper caches by
	 * path (mtime+size); redeploy cases pass the SAME path with different content.
	 */
	const deployBundle = (content: string, file?: string): string => {
		const bundlePath = file ?? path.join(dir, `bundle-${seq++}.js`);
		fs.writeFileSync(bundlePath, content);
		fs.writeFileSync(`${bundlePath}.sha256`, sha256(content));

		return bundlePath;
	};

	/**
	 * A redeploy writes a NEW mtime by nature (real deploys are minutes apart, and
	 * the tests' back-to-back writes could land on the same filesystem timestamp,
	 * which would wrongly serve the cached ETag). Nudge both mtimes forward to
	 * make the second deploy unambiguously newer.
	 */
	const redeployBundle = (content: string, bundlePath: string): void => {
		deployBundle(content, bundlePath);
		const future = new Date(Date.now() + 5_000);
		fs.utimesSync(bundlePath, future, future);
		fs.utimesSync(`${bundlePath}.sha256`, future, future);
	};

	const makeApp = (loaderPath: string, esmPath: string): express.Express => {
		const app = express();
		app.get('/v1/openvidu-meet.js', serveWebcomponentBundle(loaderPath));
		app.get('/v1/openvidu-meet.esm.js', serveWebcomponentBundle(esmPath, '*'));

		return app;
	};

	it('serves the full bundle with a strong content ETag and no-cache on first load', async () => {
		const content = '/* loader v1 */ console.log("loader");';
		const app = makeApp(deployBundle(content), deployBundle('/* esm */'));

		const res = await request(app).get('/v1/openvidu-meet.js').expect(200);

		expect(res.text).toBe(content);
		expect(res.headers['content-length']).toBe(String(Buffer.byteLength(content)));
		expect(res.headers['etag']).toBe(`"${sha256(content)}"`);
		expect(res.headers['cache-control']).toBe('no-cache');
		expect(res.headers['content-type']).toContain('javascript');
	});

	it('answers 304 with no body when the client already has the current bundle', async () => {
		const content = '/* loader v2 */';
		const app = makeApp(deployBundle(content), deployBundle('/* esm */'));

		const first = await request(app).get('/v1/openvidu-meet.js').expect(200);
		const etag = first.headers['etag'];

		const revalidated = await request(app).get('/v1/openvidu-meet.js').set('If-None-Match', etag).expect(304);

		expect(revalidated.text).toBeFalsy();
		expect(revalidated.headers['content-length']).toBeUndefined();
		// The 304 must carry the caching headers too, so the browser keeps
		// revalidating (and never falls back to heuristic caching).
		expect(revalidated.headers['etag']).toBe(etag);
		expect(revalidated.headers['cache-control']).toBe('no-cache');
	});

	it('serves the NEW bundle after a redeploy under the SAME filename (no url change needed)', async () => {
		const oldContent = '/* release 1.0.0 */';
		const newContent = '/* release 1.1.0 — bigger and better */';
		const loaderPath = deployBundle(oldContent);
		const app = makeApp(loaderPath, deployBundle('/* esm */'));

		const first = await request(app).get('/v1/openvidu-meet.js').expect(200);
		const oldEtag = first.headers['etag'];

		await request(app).get('/v1/openvidu-meet.js').set('If-None-Match', oldEtag).expect(304);

		redeployBundle(newContent, loaderPath);

		// The client still holds the OLD etag → full 200 with the new body.
		const updated = await request(app).get('/v1/openvidu-meet.js').set('If-None-Match', oldEtag).expect(200);

		expect(updated.text).toBe(newContent);
		expect(updated.headers['etag']).toBe(`"${sha256(newContent)}"`);
		expect(updated.headers['etag']).not.toBe(oldEtag);

		// And the new version is immediately revalidatable again.
		await request(app).get('/v1/openvidu-meet.js').set('If-None-Match', updated.headers['etag']).expect(304);
	});

	it('an identical redeploy (same content) does NOT bust client caches', async () => {
		const content = '/* rebuilt but byte-identical */';
		const loaderPath = deployBundle(content);
		const app = makeApp(loaderPath, deployBundle('/* esm */'));

		const first = await request(app).get('/v1/openvidu-meet.js').expect(200);

		redeployBundle(content, loaderPath);

		await request(app).get('/v1/openvidu-meet.js').set('If-None-Match', first.headers['etag']).expect(304);
	});

	it('recomputes the ETag from the real content when the sidecar is stale (mid-deploy)', async () => {
		const content = '/* new bundle, sidecar not yet updated */';
		const loaderPath = path.join(dir, 'mid-deploy.js');
		// Sidecar describes an OLD deploy and predates the bundle — as seen when a
		// request lands between the bundle rename and the sidecar write.
		fs.writeFileSync(`${loaderPath}.sha256`, 'a'.repeat(64));
		fs.writeFileSync(loaderPath, content);
		const past = new Date(Date.now() - 60_000);
		fs.utimesSync(`${loaderPath}.sha256`, past, past);

		const app = makeApp(loaderPath, deployBundle('/* esm */'));
		const res = await request(app).get('/v1/openvidu-meet.js').expect(200);

		expect(res.headers['etag']).toBe(`"${sha256(content)}"`);
		expect(res.text).toBe(content);
	});

	it('matches the current ETag inside an If-None-Match list', async () => {
		const app = makeApp(deployBundle('/* listed */'), deployBundle('/* esm */'));
		const first = await request(app).get('/v1/openvidu-meet.js').expect(200);

		await request(app)
			.get('/v1/openvidu-meet.js')
			.set('If-None-Match', `"stale-etag", ${first.headers['etag']}`)
			.expect(304);
	});

	it('ignores a stale If-None-Match and serves the full bundle', async () => {
		const content = '/* not what the client has */';
		const app = makeApp(deployBundle(content), deployBundle('/* esm */'));

		const res = await request(app).get('/v1/openvidu-meet.js').set('If-None-Match', '"stale-etag"').expect(200);

		expect(res.text).toBe(content);
	});

	it('CORS-enables the ESM bundle route only (it is import()ed cross-origin)', async () => {
		const app = makeApp(deployBundle('/* loader */'), deployBundle('/* esm cors */'));

		const esm = await request(app).get('/v1/openvidu-meet.esm.js').expect(200);
		const loader = await request(app).get('/v1/openvidu-meet.js').expect(200);

		expect(esm.headers['access-control-allow-origin']).toBe('*');
		expect(loader.headers['access-control-allow-origin']).toBeUndefined();

		// The CORS header must also be present on 304s: a revalidated cross-origin
		// module load fails without it.
		const revalidated = await request(app)
			.get('/v1/openvidu-meet.esm.js')
			.set('If-None-Match', esm.headers['etag'])
			.expect(304);

		expect(revalidated.headers['access-control-allow-origin']).toBe('*');
	});
});
