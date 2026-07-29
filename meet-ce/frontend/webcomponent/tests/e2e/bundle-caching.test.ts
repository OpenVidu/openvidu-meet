import { expect, test, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { MEET_API_URL, MEET_TESTAPP_URL } from '../config';

// ─── WebComponent bundle caching contract ───────────────────────────────────
//
// Host applications embed ONE stable url and never change it. The contract,
// exercised here with a REAL browser HTTP cache (not supertest):
//
//   1. First visit          → the loader and the ESM bundle are fully
//                             downloaded (200).
//   2. Revisit, unchanged   → both are revalidated (304, no body re-sent).
//   3. New build deployed   → same url, same filename: the next visit picks up
//                             the new bytes (200 + new ETag) with no host-app
//                             rebuild — simulated by mutating the deployed
//                             bundle on disk and restored afterwards.
//
// The testapp proxies the bundle same-origin (`/openvidu-meet.js` → backend
// `/v1/...`), preserving statuses and caching headers.
// ─────────────────────────────────────────────────────────────────────────────

interface ObservedResponse {
	pathname: string;
	status: number;
	headers: Record<string, string>;
}

const LOADER_PATH = '/openvidu-meet.js';
const ESM_ENTRY_PATH = '/openvidu-meet.esm.js';

// The deployed bundle the backend serves — anchored to THIS file (not the cwd:
// CI launches this suite from the frontend package via `e2e:playwright:wc`,
// local runs launch it from webcomponent/). The redeploy test mutates it and
// restores the original bytes, so it also requires the backend under test to
// run on THIS machine — true for the default local setup and for CI, where the
// backend is built and started from the same checkout.
const DEPLOYED_ESM_ENTRY = path.resolve(
	__dirname,
	'..',
	'..',
	'..',
	'..',
	'backend',
	'public',
	'webcomponent',
	'openvidu-meet.esm.bundle.min.js'
);
const backendIsLocal = ['localhost', '127.0.0.1'].includes(new URL(MEET_API_URL).hostname);

/**
 * Visits the testapp (whose index.html loads the WebComponent loader), mounts
 * a bare `<openvidu-meet>` so the loader `import()`s the ESM entry, waits for
 * the implementation element to be registered (= the whole module graph
 * executed), and returns every bundle-related response observed.
 */
const visitAndCollect = async (page: Page): Promise<ObservedResponse[]> => {
	const responses: ObservedResponse[] = [];
	const listener = (response: import('@playwright/test').Response): void => {
		const { pathname } = new URL(response.url());

		if (pathname === LOADER_PATH || pathname === ESM_ENTRY_PATH) {
			responses.push({ pathname, status: response.status(), headers: response.headers() });
		}
	};

	page.on('response', listener);
	await page.goto(MEET_TESTAPP_URL);
	await page.evaluate(() => {
		document.body.appendChild(document.createElement('openvidu-meet'));
	});
	await page.waitForFunction(() => !!customElements.get('openvidu-meet-impl'), undefined, { timeout: 45000 });
	page.off('response', listener);

	return responses;
};

const only = (responses: ObservedResponse[], pathname: string): ObservedResponse => {
	const matches = responses.filter((r) => r.pathname === pathname);
	expect(matches, `expected exactly one response for ${pathname}`).toHaveLength(1);

	return matches[0];
};

test.describe('WebComponent bundle caching', () => {
	test('downloads the bundle once, then revalidates with 304s on revisit', async ({ page }) => {
		// ── 1. First visit: everything downloads in full ──
		const first = await visitAndCollect(page);

		const loader = only(first, LOADER_PATH);
		expect(loader.status).toBe(200);
		expect(loader.headers['cache-control']).toBe('no-cache');
		expect(loader.headers['etag']).toMatch(/^"[a-f0-9]{64}"$/);

		const entry = only(first, ESM_ENTRY_PATH);
		expect(entry.status).toBe(200);
		expect(entry.headers['cache-control']).toBe('no-cache');
		expect(entry.headers['etag']).toMatch(/^"[a-f0-9]{64}"$/);

		// ── 2. Revisit: the stable-name bundles revalidate, nothing is re-sent ──
		const second = await visitAndCollect(page);

		expect(only(second, LOADER_PATH).status).toBe(304);
		expect(only(second, ESM_ENTRY_PATH).status).toBe(304);
	});

	test('a redeployed bundle reaches the client on the next visit, same url', async ({ page }) => {
		test.skip(
			!backendIsLocal || !fs.existsSync(DEPLOYED_ESM_ENTRY),
			'needs a local backend serving this checkout (the test rewrites the deployed bundle)'
		);
		test.setTimeout(120000);

		// Prime the cache and capture the current ETag.
		const first = await visitAndCollect(page);
		const originalEtag = only(first, ESM_ENTRY_PATH).headers['etag'];

		expect(only(await visitAndCollect(page), ESM_ENTRY_PATH).status).toBe(304);

		const originalBytes = fs.readFileSync(DEPLOYED_ESM_ENTRY);

		try {
			// ── Simulate a new release: same filename, new content. The backend
			// detects the change (stale sidecar → re-hash) and serves a new ETag. ──
			fs.writeFileSync(
				DEPLOYED_ESM_ENTRY,
				Buffer.concat([originalBytes, Buffer.from('\n/* e2e-cache-probe */')])
			);

			const afterDeploy = await visitAndCollect(page);
			const updatedEntry = only(afterDeploy, ESM_ENTRY_PATH);

			expect(updatedEntry.status).toBe(200);
			expect(updatedEntry.headers['etag']).toMatch(/^"[a-f0-9]{64}"$/);
			expect(updatedEntry.headers['etag']).not.toBe(originalEtag);
			// The loader itself was NOT redeployed → still a 304.
			expect(only(afterDeploy, LOADER_PATH).status).toBe(304);
		} finally {
			fs.writeFileSync(DEPLOYED_ESM_ENTRY, originalBytes);
		}

		// ── Roll back deployed (restored original bytes): the client gets the
		// original content — and the ETag proves it is byte-identical again. ──
		const afterRestore = await visitAndCollect(page);
		const restoredEntry = only(afterRestore, ESM_ENTRY_PATH);

		expect(restoredEntry.status).toBe(200);
		expect(restoredEntry.headers['etag']).toBe(originalEtag);
	});
});
