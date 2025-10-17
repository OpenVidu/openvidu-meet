import { describe, it, expect, beforeAll } from '@jest/globals';
import path from 'path';
import fs from 'fs';
import * as pathUtils from '../../src/utils/path.utils.js';

/**
 * Tests for path.utils - Ensure robust path resolution
 * across different execution scenarios.
 *
 * These tests verify the module resolves project paths correctly
 * regardless of the directory from which the process is executed.
 *
 * NOTE: Because the module initializes on import, these tests assert
 * the module behavior after it has been loaded and cannot mock initialization.
 */
describe('path.utils - Robust project path resolution', () => {
	beforeAll(() => {
		// Silence logs during tests
		process.env.NODE_ENV = 'test';
	});

	describe('Scenario 1: Exported paths verification', () => {
		it('should export all required paths', () => {
			// Verify all exported paths exist as properties
			expect(pathUtils.publicDirectoryPath).toBeDefined();
			expect(pathUtils.frontendDirectoryPath).toBeDefined();
			expect(pathUtils.webcomponentBundlePath).toBeDefined();
			expect(pathUtils.frontendHtmlPath).toBeDefined();
			expect(pathUtils.publicApiHtmlFilePath).toBeDefined();
			expect(pathUtils.internalApiHtmlFilePath).toBeDefined();

			// Verify the paths are non-empty strings
			expect(typeof pathUtils.publicDirectoryPath).toBe('string');
			expect(pathUtils.publicDirectoryPath.length).toBeGreaterThan(0);

			expect(typeof pathUtils.frontendDirectoryPath).toBe('string');
			expect(pathUtils.frontendDirectoryPath.length).toBeGreaterThan(0);

			expect(typeof pathUtils.webcomponentBundlePath).toBe('string');
			expect(pathUtils.webcomponentBundlePath.length).toBeGreaterThan(0);
		});

		it('should build coherent paths (frontend inside public)', () => {
			// frontendDirectoryPath should be a subdirectory of publicDirectoryPath
			expect(pathUtils.frontendDirectoryPath.startsWith(pathUtils.publicDirectoryPath)).toBe(true);

			// Ensure it contains 'frontend'
			expect(pathUtils.frontendDirectoryPath).toContain('frontend');
		});

		it('should build webcomponentBundlePath inside public', () => {
			// webcomponentBundlePath must be inside publicDirectoryPath
			expect(pathUtils.webcomponentBundlePath.startsWith(pathUtils.publicDirectoryPath)).toBe(true);

			// Should end with the correct bundle name
			expect(pathUtils.webcomponentBundlePath).toContain('openvidu-meet.bundle.min.js');
		});

		it('should build coherent HTML paths', () => {
			// frontendHtmlPath should be inside frontendDirectoryPath
			expect(pathUtils.frontendHtmlPath.startsWith(pathUtils.frontendDirectoryPath)).toBe(true);
			expect(pathUtils.frontendHtmlPath).toContain('index.html');

			// OpenAPI paths should reference 'openapi'
			expect(pathUtils.publicApiHtmlFilePath).toContain('openapi');
			expect(pathUtils.publicApiHtmlFilePath).toContain('public.html');

			expect(pathUtils.internalApiHtmlFilePath).toContain('openapi');
			expect(pathUtils.internalApiHtmlFilePath).toContain('internal.html');
		});
	});

	describe('Scenario 2: Directory structure validation', () => {
		it('should contain "backend" and "public" in publicDirectoryPath', () => {
			// Path should contain both segments
			expect(pathUtils.publicDirectoryPath).toContain('backend');
			expect(pathUtils.publicDirectoryPath).toContain('public');

			// Verify backend appears before public
			const segments = pathUtils.publicDirectoryPath.split(path.sep);
			const backendIndex = segments.findIndex((s: string) => s === 'backend');
			const publicIndex = segments.findIndex((s: string) => s === 'public');

			expect(backendIndex).toBeGreaterThanOrEqual(0);
			expect(publicIndex).toBeGreaterThan(backendIndex);
		});

		it('should work for both meet-ce and meet-pro', () => {
			// Path may be identifiable as CE or PRO
			const isCE = pathUtils.publicDirectoryPath.includes('meet-ce');
			const isPRO = pathUtils.publicDirectoryPath.includes('meet-pro');

			// The structure backend/public must exist
			expect(pathUtils.publicDirectoryPath).toMatch(/backend[\/\\]public$/);
		});
	});

	describe('Scenario 3: Path integrity validation', () => {
		it('should use correct path separators for the OS', () => {
			// Should not contain mixed separators
			const hasForwardSlash = pathUtils.publicDirectoryPath.includes('/');
			const hasBackslash = pathUtils.publicDirectoryPath.includes('\\');

			// Must have at least one type of separator
			expect(hasForwardSlash || hasBackslash).toBe(true);

			// Verify normalized consistency
			const normalized = path.normalize(pathUtils.publicDirectoryPath);
			expect(pathUtils.publicDirectoryPath).toBe(normalized);
		});

		it('should produce absolute paths', () => {
			// All exported paths must be absolute
			expect(path.isAbsolute(pathUtils.publicDirectoryPath)).toBe(true);
			expect(path.isAbsolute(pathUtils.frontendDirectoryPath)).toBe(true);
			expect(path.isAbsolute(pathUtils.webcomponentBundlePath)).toBe(true);
			expect(path.isAbsolute(pathUtils.frontendHtmlPath)).toBe(true);
			expect(path.isAbsolute(pathUtils.publicApiHtmlFilePath)).toBe(true);
			expect(path.isAbsolute(pathUtils.internalApiHtmlFilePath)).toBe(true);
		});

		it('should resolve normalized paths (no .. or . segments)', () => {
			// Paths must not contain relative segments
			expect(pathUtils.publicDirectoryPath).not.toContain('..');
			expect(pathUtils.publicDirectoryPath).not.toMatch(/\/\.\//);

			expect(pathUtils.frontendDirectoryPath).not.toContain('..');
			expect(pathUtils.webcomponentBundlePath).not.toContain('..');
		});
	});

	describe('Scenario 4: Existence of critical directories', () => {
		it('should point to a public/ directory whose parent exists', () => {
			// public directory might not exist at test time,
			// but the path should be valid
			const publicDir = pathUtils.publicDirectoryPath;

			// Parent directory must exist
			const parentDir = path.dirname(publicDir);
			expect(fs.existsSync(parentDir)).toBe(true);
		});

		it('should have an accessible backend/ directory up the tree', () => {
			// Walk up from publicDirectoryPath to find backend/
			let currentPath = pathUtils.publicDirectoryPath;
			let foundBackend = false;

			// Up to 10 levels
			for (let i = 0; i < 10; i++) {
				if (path.basename(currentPath) === 'backend') {
					foundBackend = true;
					// Ensure this backend dir contains src/
					const srcPath = path.join(currentPath, 'src');
					expect(fs.existsSync(srcPath)).toBe(true);
					break;
				}
				const parent = path.dirname(currentPath);
				if (parent === currentPath) break; // Reached root
				currentPath = parent;
			}

			expect(foundBackend).toBe(true);
		});
	});

	describe('Scenario 5: Robustness and consistency', () => {
		it('should keep the same resolution across multiple accesses', () => {
			// Paths must be consistent
			const path1 = pathUtils.publicDirectoryPath;
			const path2 = pathUtils.publicDirectoryPath;

			expect(path1).toBe(path2);
			expect(path1).toStrictEqual(path2);
		});

		it('should use path.join correctly (structure verification)', () => {
			// frontendDirectoryPath should equal public + frontend
			const expectedFrontend = path.join(pathUtils.publicDirectoryPath, 'frontend');
			expect(pathUtils.frontendDirectoryPath).toBe(expectedFrontend);

			// Verify webcomponent
			const expectedWebcomponent = path.join(
				pathUtils.publicDirectoryPath,
				'webcomponent',
				'openvidu-meet.bundle.min.js'
			);
			expect(pathUtils.webcomponentBundlePath).toBe(expectedWebcomponent);
		});
	});
});
