import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { execFileSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Contract tests for scripts/deploy-to-backend.js, the step that publishes the
 * WebComponent build into the backend's public dir. Host apps rely on the
 * result: the two bundles land under their stable served names, and each
 * `.sha256` sidecar hashes the DEPLOYED content — the sidecar drives the
 * backend's ETag, which is what gives hosts cheap 304s while the bundle is
 * unchanged and an instant update after a redeploy.
 *
 * The script runs against fabricated dirs via MEET_WC_DIST_DIR /
 * MEET_BACKEND_PUBLIC_DIR, so no real build is needed.
 */
describe('deploy-to-backend script', () => {
	// cwd is the package root: jest always runs through `pnpm run test:unit` /
	// `pnpm --filter @openvidu-meet/webcomponent run test:unit` (meet.sh + CI).
	const scriptPath = path.resolve('scripts/deploy-to-backend.js');
	let distDir: string;
	let publicDir: string;
	let destDir: string;

	const sha256 = (content: string): string => crypto.createHash('sha256').update(Buffer.from(content)).digest('hex');

	const writeBuild = (esmContent: string, loaderContent: string): void => {
		fs.writeFileSync(path.join(distDir, 'openvidu-meet-wc.esm.js'), esmContent);
		fs.writeFileSync(path.join(distDir, 'openvidu-meet-loader.js'), loaderContent);
	};

	const deploy = (): void => {
		execFileSync(process.execPath, [scriptPath], {
			env: { ...process.env, MEET_WC_DIST_DIR: distDir, MEET_BACKEND_PUBLIC_DIR: publicDir }
		});
	};

	beforeEach(() => {
		distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ov-meet-wc-dist-'));
		publicDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ov-meet-wc-public-'));
		destDir = path.join(publicDir, 'webcomponent');
	});

	afterEach(() => {
		fs.rmSync(distDir, { recursive: true, force: true });
		fs.rmSync(publicDir, { recursive: true, force: true });
	});

	it('deploys both bundles under their stable served names with content-hash sidecars', () => {
		writeBuild('esm v1', 'loader v1');
		deploy();

		expect(fs.readFileSync(path.join(destDir, 'openvidu-meet.esm.bundle.min.js'), 'utf8')).toBe('esm v1');
		expect(fs.readFileSync(path.join(destDir, 'openvidu-meet.loader.min.js'), 'utf8')).toBe('loader v1');
		// The sidecars must hash the DEPLOYED content: they become the ETag hosts revalidate against.
		expect(fs.readFileSync(path.join(destDir, 'openvidu-meet.esm.bundle.min.js.sha256'), 'utf8')).toBe(
			sha256('esm v1')
		);
		expect(fs.readFileSync(path.join(destDir, 'openvidu-meet.loader.min.js.sha256'), 'utf8')).toBe(
			sha256('loader v1')
		);
	});

	it('a redeploy overwrites the bundles in place and refreshes the sidecars', () => {
		writeBuild('esm v1', 'loader v1');
		deploy();

		writeBuild('esm v2 — new release', 'loader v2');
		deploy();

		expect(fs.readFileSync(path.join(destDir, 'openvidu-meet.esm.bundle.min.js'), 'utf8')).toBe(
			'esm v2 — new release'
		);
		expect(fs.readFileSync(path.join(destDir, 'openvidu-meet.esm.bundle.min.js.sha256'), 'utf8')).toBe(
			sha256('esm v2 — new release')
		);
		expect(fs.readFileSync(path.join(destDir, 'openvidu-meet.loader.min.js.sha256'), 'utf8')).toBe(
			sha256('loader v2')
		);
	});

	it('leaves no temp files behind (atomic copy + rename)', () => {
		writeBuild('esm', 'loader');
		deploy();

		const leftovers = fs.readdirSync(destDir).filter((f) => f.startsWith('.'));
		expect(leftovers).toEqual([]);
	});

	it('fails loudly when the build outputs are missing', () => {
		expect(() => deploy()).toThrow();
	});
});
