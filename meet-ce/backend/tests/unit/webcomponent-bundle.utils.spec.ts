import { afterAll, describe, expect, it } from '@jest/globals';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getWebcomponentBundleEtag, matchesIfNoneMatch } from '../../src/utils/webcomponent-bundle.utils.js';

/**
 * Tests for the WebComponent bundle ETag helper, in particular the content-hash
 * sidecar (`<bundle>.sha256`) that lets the backend answer the ETag from a tiny
 * read instead of re-hashing the multi-MB bundle on the event loop.
 */
describe('webcomponent-bundle.utils - ETag with content-hash sidecar', () => {
	const created: string[] = [];
	let seq = 0;

	// Each case uses a UNIQUE path: getWebcomponentBundleEtag caches by mtime/size
	// in a module-level map, so reusing a path across cases would return a stale
	// cached ETag.
	const makeBundle = (content: string): string => {
		const file = path.join(os.tmpdir(), `ov-meet-etag-${process.pid}-${seq++}.js`);
		fs.writeFileSync(file, content);
		created.push(file, `${file}.sha256`);
		return file;
	};

	const sha256 = (content: string): string => crypto.createHash('sha256').update(Buffer.from(content)).digest('hex');

	afterAll(() => {
		for (const file of created) {
			try {
				fs.rmSync(file);
			} catch {
				// best-effort cleanup
			}
		}
	});

	it('hashes the file content when no sidecar exists', () => {
		const content = 'bundle-no-sidecar';
		const file = makeBundle(content);

		expect(getWebcomponentBundleEtag(file)).toBe(`"${sha256(content)}"`);
	});

	it('reads the hash from the sidecar when present and current', () => {
		const file = makeBundle('bundle-with-sidecar');
		// A sentinel hash distinct from the file's real content hash proves the
		// value came from the sidecar, not from re-hashing the file.
		const sentinel = 'a'.repeat(64);
		fs.writeFileSync(`${file}.sha256`, sentinel);

		expect(getWebcomponentBundleEtag(file)).toBe(`"${sentinel}"`);
	});

	it('accepts the "<hash>  filename" sha256sum sidecar format', () => {
		const file = makeBundle('bundle-sha256sum-format');
		const sentinel = 'c'.repeat(64);
		fs.writeFileSync(`${file}.sha256`, `${sentinel}  openvidu-meet.esm.bundle.min.js\n`);

		expect(getWebcomponentBundleEtag(file)).toBe(`"${sentinel}"`);
	});

	it('ignores a sidecar older than the bundle (stale) and recomputes', () => {
		const content = 'bundle-stale-sidecar';
		const file = makeBundle(content);
		fs.writeFileSync(`${file}.sha256`, 'b'.repeat(64));

		// Sidecar predates the bundle (as it would mid-deploy, between the bundle
		// rename and the sidecar write) → must be treated as stale.
		const past = new Date(Date.now() - 60_000);
		const now = new Date();
		fs.utimesSync(`${file}.sha256`, past, past);
		fs.utimesSync(file, now, now);

		expect(getWebcomponentBundleEtag(file)).toBe(`"${sha256(content)}"`);
	});

	it('ignores a malformed sidecar and recomputes', () => {
		const content = 'bundle-malformed-sidecar';
		const file = makeBundle(content);
		fs.writeFileSync(`${file}.sha256`, 'not-a-valid-sha256');

		expect(getWebcomponentBundleEtag(file)).toBe(`"${sha256(content)}"`);
	});

	it('returns null when the bundle file cannot be read', () => {
		expect(getWebcomponentBundleEtag(path.join(os.tmpdir(), `ov-meet-missing-${process.pid}.js`))).toBeNull();
	});

	it('returns the cached ETag on repeated reads of an unchanged bundle', () => {
		const file = makeBundle('bundle-cached');
		const first = getWebcomponentBundleEtag(file);

		expect(getWebcomponentBundleEtag(file)).toBe(first);
	});
});

describe('webcomponent-bundle.utils - matchesIfNoneMatch', () => {
	it('is false when the request has no If-None-Match header', () => {
		expect(matchesIfNoneMatch(undefined, '"etag"')).toBe(false);
	});

	it('matches a single ETag', () => {
		expect(matchesIfNoneMatch('"etag"', '"etag"')).toBe(true);
	});

	it('matches an ETag within a comma-separated list (with whitespace)', () => {
		expect(matchesIfNoneMatch('"other", "etag"', '"etag"')).toBe(true);
	});

	it('does not match a different ETag', () => {
		expect(matchesIfNoneMatch('"other"', '"etag"')).toBe(false);
	});
});
