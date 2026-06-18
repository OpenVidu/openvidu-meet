import { describe, expect, it } from '@jest/globals';
import { computeServerUrl, lastPathSegment, queryParam } from '../../src/app/utils/url';

describe('Last path segment extraction', () => {
	it('returns the last non-empty segment of the URL path', () => {
		expect(lastPathSegment('https://demo.openvidu.io/room/my-room')).toBe('my-room');
	});

	it('ignores a trailing slash when selecting the last segment', () => {
		expect(lastPathSegment('https://demo.openvidu.io/room/my-room/')).toBe('my-room');
	});

	it('returns null when the path has no segments', () => {
		expect(lastPathSegment('https://demo.openvidu.io/')).toBeNull();
	});

	it('returns null when the URL cannot be parsed', () => {
		expect(lastPathSegment('not-a-valid-url')).toBeNull();
	});
});

describe('Query parameter lookup', () => {
	it('returns the value of the requested query parameter when present', () => {
		expect(queryParam('https://demo.openvidu.io/room/my-room?secret=abc123', 'secret')).toBe('abc123');
	});

	it('returns null when the requested parameter is absent', () => {
		expect(queryParam('https://demo.openvidu.io/room/my-room?secret=abc123', 'missing')).toBeNull();
	});

	it('returns null when the URL cannot be parsed', () => {
		expect(queryParam('not-a-valid-url', 'secret')).toBeNull();
	});
});

describe('Server base URL computation', () => {
	it('returns the base URL up to the marker segment', () => {
		expect(computeServerUrl('http://localhost:6080/meet/room/my-room', '/room/')).toBe('http://localhost:6080/meet');
	});

	it('derives the base URL from the "/recording/" marker', () => {
		expect(computeServerUrl('http://localhost:6080/meet/recording/rec-1', '/recording/')).toBe(
			'http://localhost:6080/meet'
		);
	});

	it('returns null when the URL is empty', () => {
		expect(computeServerUrl('', '/room/')).toBeNull();
	});

	it('returns null when the marker segment is absent from the path', () => {
		expect(computeServerUrl('http://localhost:6080/meet/other/x', '/room/')).toBeNull();
	});

	it('returns null when the URL cannot be parsed', () => {
		expect(computeServerUrl('not-a-valid-url', '/room/')).toBeNull();
	});
});
