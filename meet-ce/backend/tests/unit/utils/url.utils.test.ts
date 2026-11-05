import { afterEach, describe, expect, it } from '@jest/globals';
import { MEET_ENV } from '../../../src/environment.js';
import { requestContextStorage } from '../../../src/utils/request-context.utils.js';
import { addBaseUrlToPath, extractPathFromUrl, getBaseUrl, stripBasePath } from '../../../src/utils/url.utils.js';

const original = { baseUrl: MEET_ENV.BASE_URL, basePath: MEET_ENV.BASE_PATH, port: MEET_ENV.SERVER_PORT };

const configure = (baseUrl: string, basePath: string) =>
	Object.assign(MEET_ENV, { BASE_URL: baseUrl, BASE_PATH: basePath, SERVER_PORT: '6080' });

afterEach(() => {
	Object.assign(MEET_ENV, { BASE_URL: original.baseUrl, BASE_PATH: original.basePath, SERVER_PORT: original.port });
});

describe('getBaseUrl', () => {
	it.each([
		['https://example.com', '/meet', 'https://example.com/meet'],
		['https://example.com/', '/meet/', 'https://example.com/meet'],
		['https://example.com:443/', '/meet', 'https://example.com/meet'],
		['http://example.com:80', '/', 'http://example.com'],
		['https://example.com:8443', '/meet', 'https://example.com:8443/meet'],
		['http://example.com:8080', '/meet', 'http://example.com:8080/meet'],
		['http://example.com:8000', '/', 'http://example.com:8000'],
		['https://example.com:4430', '/', 'https://example.com:4430'],
		['http://example.com:443', '/', 'http://example.com:443']
	])('builds public URLs from MEET_BASE_URL %s and base path %s as %s', (baseUrl, basePath, expected) => {
		configure(baseUrl, basePath);

		expect(getBaseUrl()).toBe(expected);
	});

	it('uses the origin the request was addressed to when MEET_BASE_URL is unset', () => {
		configure('', '/meet');

		const url = requestContextStorage.run({ requestId: 'r-1', origin: 'https://meet.local:5443' }, getBaseUrl);

		expect(url).toBe('https://meet.local:5443/meet');
	});

	it('uses the local server address outside any request when MEET_BASE_URL is unset', () => {
		configure('', '/');

		expect(getBaseUrl()).toBe('http://localhost:6080');
	});

	it('joins a path to the base URL with exactly one slash', () => {
		configure('https://example.com', '/meet');

		expect(addBaseUrlToPath('/room/r-1')).toBe('https://example.com/meet/room/r-1');
		expect(addBaseUrlToPath('room/r-1')).toBe('https://example.com/meet/room/r-1');
	});
});

describe('stripBasePath and extractPathFromUrl', () => {
	it('removes the base path from an absolute path that starts with it', () => {
		configure('', '/meet');

		expect(stripBasePath('/meet/room/r-1')).toBe('/room/r-1');
		expect(stripBasePath('/meet')).toBe('/');
		expect(stripBasePath('/room/r-1')).toBe('/room/r-1');
	});

	it('leaves a path whose first segment only begins like the base path', () => {
		configure('', '/r');

		expect(stripBasePath('/room/r-1')).toBe('/room/r-1');
		expect(stripBasePath('/r/room/r-1')).toBe('/room/r-1');
	});

	it('leaves every path alone under the root base path', () => {
		configure('', '/');

		expect(stripBasePath('/room/r-1')).toBe('/room/r-1');
	});

	it('keeps the query and fragment of a full URL and drops its origin and base path', () => {
		configure('', '/meet');

		expect(extractPathFromUrl('https://example.com/meet/room/r-1?secret=abc#x')).toBe('/room/r-1?secret=abc#x');
		expect(extractPathFromUrl('/meet/room/r-1?secret=abc')).toBe('/room/r-1?secret=abc');
	});

	it('returns a value that is neither a path nor a URL unchanged', () => {
		configure('', '/meet');

		expect(extractPathFromUrl('not a url')).toBe('not a url');
	});
});
