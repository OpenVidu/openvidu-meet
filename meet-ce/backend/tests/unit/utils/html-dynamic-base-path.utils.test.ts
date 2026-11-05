import { afterAll, afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { MEET_ENV } from '../../../src/environment.js';
import {
	clearHtmlCache,
	getBasePath,
	getHtmlWithBasePath,
	getOpenApiHtmlWithBasePath,
	normalizeBasePath
} from '../../../src/utils/html-dynamic-base-path.utils.js';

describe('normalizeBasePath', () => {
	it.each([
		['', '/'],
		['   ', '/'],
		['/', '/'],
		['meet', '/meet/'],
		['/meet', '/meet/'],
		['meet/', '/meet/'],
		[' /app/path ', '/app/path/']
	])('normalizes %j to %j', (input, expected) => {
		expect(normalizeBasePath(input)).toBe(expected);
	});
});

describe('base path injection into the served HTML', () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ov-meet-base-path-'));
	const indexPath = path.join(dir, 'index.html');
	const openApiPath = path.join(dir, 'openapi.html');
	const original = { basePath: MEET_ENV.BASE_PATH, nodeEnv: process.env.NODE_ENV };

	beforeAll(() => {
		fs.writeFileSync(indexPath, '<html><head><base href="/" /><title>Meet</title></head><body></body></html>');
		fs.writeFileSync(
			openApiPath,
			'<script>const spec = {"openapi":"3.1.0","servers":[{"url":"/api/v1"}],"paths":{}};</script>'
		);
	});

	afterEach(() => {
		MEET_ENV.BASE_PATH = original.basePath;
		process.env.NODE_ENV = original.nodeEnv;
		clearHtmlCache();
	});

	afterAll(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});

	it('points the SPA at the configured base path and tells the frontend about it', () => {
		MEET_ENV.BASE_PATH = 'meet';

		const html = getHtmlWithBasePath(indexPath);

		expect(html).toBe(
			'<html><head><base href="/meet/"><title>Meet</title>' +
				'<script>window.__OPENVIDU_MEET_CONFIG__={basePath:"/meet/"};</script>\n</head><body></body></html>'
		);
	});

	it.each(['<base href="">', '<base href="/old/">', '<base href="/"/>', '<BASE href="/"  />'])(
		'replaces the base tag %s whatever its form',
		(baseTag) => {
			const file = path.join(dir, 'variant.html');
			fs.writeFileSync(file, `<head>${baseTag}</head>`);
			MEET_ENV.BASE_PATH = '/meet/';

			expect(getHtmlWithBasePath(file)).toMatch(/^<head><base href="\/meet\/"><script>/);
		}
	);

	it('points the API reference at the API under the configured base path', () => {
		MEET_ENV.BASE_PATH = '/meet/';

		expect(getOpenApiHtmlWithBasePath(openApiPath, '/api/v1')).toContain('"servers":[{"url":"/meet/api/v1"}]');

		MEET_ENV.BASE_PATH = '/';
		expect(getOpenApiHtmlWithBasePath(openApiPath, '/internal-api/v1')).toContain(
			'"servers":[{"url":"/internal-api/v1"}]'
		);
	});

	it('renders the HTML once in production and every time otherwise', () => {
		process.env.NODE_ENV = 'production';
		MEET_ENV.BASE_PATH = '/first/';
		getHtmlWithBasePath(indexPath);
		getOpenApiHtmlWithBasePath(openApiPath, '/api/v1');

		MEET_ENV.BASE_PATH = '/second/';
		expect(getHtmlWithBasePath(indexPath)).toContain('<base href="/first/">');
		expect(getOpenApiHtmlWithBasePath(openApiPath, '/api/v1')).toContain('"url":"/first/api/v1"');

		process.env.NODE_ENV = 'development';
		expect(getHtmlWithBasePath(indexPath)).toContain('<base href="/second/">');
		expect(getOpenApiHtmlWithBasePath(openApiPath, '/api/v1')).toContain('"url":"/second/api/v1"');
	});
});

describe('getBasePath configuration warnings', () => {
	const original = { baseUrl: MEET_ENV.BASE_URL, basePath: MEET_ENV.BASE_PATH };

	afterEach(() => {
		Object.assign(MEET_ENV, { BASE_URL: original.baseUrl, BASE_PATH: original.basePath });
		jest.restoreAllMocks();
	});

	const warningsFor = async (baseUrl: string, basePath: string) => {
		jest.resetModules();
		const { MEET_ENV: env } = await import('../../../src/environment.js');
		Object.assign(env, { BASE_URL: baseUrl, BASE_PATH: basePath });
		const { getBasePath: freshGetBasePath } = await import('../../../src/utils/html-dynamic-base-path.utils.js');
		const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

		const basePathResult = freshGetBasePath();
		freshGetBasePath();

		return { basePathResult, warnings: warn.mock.calls.map((call) => call.join(' ')) };
	};

	it('says nothing when no base URL is configured', async () => {
		const { warnings } = await warningsFor('', '/meet/');

		expect(warnings).toEqual([]);
	});

	it('says nothing about a base URL made of protocol and host only', async () => {
		const { basePathResult, warnings } = await warningsFor('https://example.com', '/meet/');

		expect(basePathResult).toBe('/meet/');
		expect(warnings).toEqual([]);
	});

	it('warns once about a base URL that carries a path, and about its clash with a base path', async () => {
		const { warnings } = await warningsFor('https://example.com/meet', '/meet/');

		expect(warnings).toHaveLength(4);
		expect(warnings[0]).toContain('MEET_BASE_URL contains a path segment');
		expect(warnings[3]).toContain('BASE_URL path "/meet" + BASE_PATH "/meet/"');
	});

	it('does not report a clash when the base path is the root', async () => {
		const { warnings } = await warningsFor('https://example.com/meet', '/');

		expect(warnings).toHaveLength(3);
	});

	it('warns about a base URL that is not a URL', async () => {
		const { warnings } = await warningsFor('example.com', '/');

		expect(warnings).toEqual([expect.stringContaining('MEET_BASE_URL is not a valid URL')]);
	});

	it('reads the base path from the configuration', () => {
		MEET_ENV.BASE_PATH = 'custom';

		expect(getBasePath()).toBe('/custom/');
	});
});
