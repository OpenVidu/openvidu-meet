import { describe, expect, it } from '@jest/globals';
import { isRedactedStreamUrl, isValidStreamUrl, redactStreamUrl } from '@openvidu-meet/typings';

const YOUTUBE = 'rtmp://a.rtmp.youtube.com/live2/abcd-efgh-ijkl';
const TWITCH = 'rtmps://live.twitch.tv:443/app/live_123456_XyZ?bandwidthtest=true';
const REDACTED_YOUTUBE = 'rtmp://a.rtmp.youtube.com/live2/********';

describe('redactStreamUrl and isRedactedStreamUrl', () => {
	it('replaces the stream key and drops the query string, keeping scheme, host and path', () => {
		expect(redactStreamUrl(YOUTUBE)).toBe(REDACTED_YOUTUBE);
		expect(redactStreamUrl(TWITCH)).toBe('rtmps://live.twitch.tv:443/app/********');
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
		expect(isRedactedStreamUrl(YOUTUBE)).toBe(false);
	});
});

describe('isValidStreamUrl', () => {
	it('accepts the form the media server streams to: host, optional path, app and stream key', () => {
		expect(isValidStreamUrl(YOUTUBE)).toBe(true);
		expect(isValidStreamUrl(TWITCH)).toBe(true);
		expect(isValidStreamUrl('rtmp://media.example.com:1935/path/to/app/key')).toBe(true);
		expect(isValidStreamUrl('rtmp://media.example.com/app/key live=1')).toBe(true);
		expect(isValidStreamUrl(REDACTED_YOUTUBE)).toBe(true);
	});

	it('refuses a URL without app or stream key, ending in a slash, or of another scheme', () => {
		expect(isValidStreamUrl('rtmp://media.example.com')).toBe(false);
		expect(isValidStreamUrl('rtmp://media.example.com/key-without-app')).toBe(false);
		expect(isValidStreamUrl('rtmp://media.example.com/live/key/')).toBe(false);
		expect(isValidStreamUrl('rtmp://media.example.com/live/')).toBe(false);
		expect(isValidStreamUrl('http://media.example.com/live/key')).toBe(false);
	});
});
