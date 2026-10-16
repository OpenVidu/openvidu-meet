import { describe, expect, it } from '@jest/globals';
import { isRedactedStreamUrl, isValidStreamUrl, redactStreamUrl } from '@openvidu-meet/typings';

const YOUTUBE = 'rtmp://a.rtmp.youtube.com/live2/abcd-efgh-ijkl';
const YOUTUBE_BACKUP = 'rtmp://b.rtmp.youtube.com/live2?backup=1/abcd-efgh-ijkl';
const TWITCH = 'rtmps://live.twitch.tv:443/app/live_123456_XyZ?bandwidthtest=true';
const REDACTED_YOUTUBE = 'rtmp://a.rtmp.youtube.com/live2/********';

const VALID = [
	YOUTUBE,
	YOUTUBE_BACKUP,
	TWITCH,
	'rtmp://media.example.com:1935/path/to/app/key',
	'rtmp://[::1]:1935/live/key',
	'rtmp://media.example.com/app/key live=1',
	REDACTED_YOUTUBE,
	`${REDACTED_YOUTUBE}?x=1`
];

const INVALID = [
	'rtmp://media.example.com',
	'rtmp://media.example.com/key-without-app',
	'rtmp://media.example.com/live/key/',
	'rtmp://media.example.com/live/',
	'rtmp://media.example.com/live//key',
	'rtmp:///live/key',
	'rtmp://media.example.com?x=1/live/key',
	'rtmp://media example.com/live/key',
	'rtmp://media.example.com/live/key live=1 live=1',
	'rtmp://media.example.com/live/key#frag',
	'rtmp://media.example.com/live/#ov-stream-tag=x',
	'rtmp://media.example.com/live/?key=secret',
	'http://media.example.com/live/key'
];

describe('redactStreamUrl and isRedactedStreamUrl', () => {
	it('replaces what follows the last slash, query string included, and drops the live=1 flag', () => {
		expect(redactStreamUrl(YOUTUBE)).toBe(REDACTED_YOUTUBE);
		expect(redactStreamUrl(TWITCH)).toBe('rtmps://live.twitch.tv:443/app/********');
		expect(redactStreamUrl(YOUTUBE_BACKUP)).toBe('rtmp://b.rtmp.youtube.com/live2?backup=1/********');
		expect(redactStreamUrl('rtmp://media.example.com/app/key live=1')).toBe(
			'rtmp://media.example.com/app/********'
		);
	});

	it('masks the stream key before a trailing slash', () => {
		expect(redactStreamUrl('rtmp://stream.example.com/live/secret-key/')).toBe(
			'rtmp://stream.example.com/live/********/'
		);
		expect(isRedactedStreamUrl('rtmp://stream.example.com/live/********/')).toBe(true);
	});

	it('masks the only segment when the URL has no application path', () => {
		expect(redactStreamUrl('rtmp://stream.example.com')).toBe('rtmp://stream.example.com/********');
		expect(redactStreamUrl('rtmp://stream.example.com/key')).toBe('rtmp://stream.example.com/********');
	});

	it('recognises its own output and nothing else', () => {
		expect(isRedactedStreamUrl(REDACTED_YOUTUBE)).toBe(true);
		expect(isRedactedStreamUrl(`${REDACTED_YOUTUBE}?x=1`)).toBe(true);
		expect(isRedactedStreamUrl(`${REDACTED_YOUTUBE} live=1`)).toBe(true);
		expect(isRedactedStreamUrl(YOUTUBE)).toBe(false);
		expect(isRedactedStreamUrl('rtmp://********')).toBe(false);
	});
});

describe('isValidStreamUrl', () => {
	it('accepts the form the media server streams to: host, optional path, app and stream key', () => {
		for (const url of VALID) expect([url, isValidStreamUrl(url)]).toEqual([url, true]);
	});

	it('refuses a URL without host, app or stream key, with a fragment, with whitespace or of another scheme', () => {
		for (const url of INVALID) expect([url, isValidStreamUrl(url)]).toEqual([url, false]);
	});

	it('serves every accepted URL in a form it accepts back', () => {
		for (const url of VALID) expect([url, isValidStreamUrl(redactStreamUrl(url))]).toEqual([url, true]);
	});

	it('answers at once for a long URL made of slashes, which a backtracking pattern takes minutes on', () => {
		expect(isValidStreamUrl(`rtmp:///${'/'.repeat(1_000_000)} `)).toBe(false);
	});
});
