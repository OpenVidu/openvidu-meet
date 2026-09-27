import {
	BroadcastPlatform,
	detectBroadcastPlatform,
	extractBroadcastHost,
	isRedactedStreamUrl
} from './broadcast-platform.utils';

/**
 * The platform icon is chosen from the RTMP host alone: the stream key never leaves the server and
 * the URL comes back redacted, so the host is all the wizard and the activity can read.
 */
describe('detectBroadcastPlatform', () => {
	const INGEST_URLS: [string, BroadcastPlatform][] = [
		['rtmp://a.rtmp.youtube.com/live2/abcd-1234', 'youtube'],
		['rtmps://live-api-s.facebook.com:443/rtmp/FB-KEY', 'facebook'],
		['rtmps://live-upload.instagram.com:443/rtmp/IG-KEY', 'instagram'],
		['rtmp://va.pscp.tv:80/x/KEY', 'x'],
		['rtmps://rtmp-global.cloud.vimeo.com/live/KEY', 'vimeo'],
		['rtmp://live.twitch.tv/app/live_KEY', 'twitch'],
		['rtmps://mad01.contribute.live-video.net/app/live_KEY', 'twitch'],
		['rtmps://fa723fc1b171.global-contribute.live-video.net/app/sk_KEY', 'kick'],
		['rtmp://media.example.com/live/key', 'other']
	];

	for (const [url, platform] of INGEST_URLS) {
		it(`recognises ${platform} from ${extractBroadcastHost(url)}`, () => {
			expect(detectBroadcastPlatform(url)).toBe(platform);
		});
	}

	it('reads the host regardless of case and surrounding whitespace', () => {
		expect(detectBroadcastPlatform('  rtmp://A.RTMP.YOUTUBE.COM/live2/key ')).toBe('youtube');
	});

	it('does not take a look-alike host for the platform', () => {
		expect(detectBroadcastPlatform('rtmp://youtube.com.example.net/live2/key')).toBe('other');
	});

	it('falls back to a generic server for a URL that does not parse', () => {
		expect(extractBroadcastHost('not a url')).toBe('');
		expect(detectBroadcastPlatform('not a url')).toBe('other');
	});
});

describe('isRedactedStreamUrl', () => {
	it('recognises the placeholder the server puts in place of the stream key', () => {
		expect(isRedactedStreamUrl('rtmp://a.rtmp.youtube.com/live2/********')).toBeTrue();
	});

	it('ignores anything after the key, a trailing slash included', () => {
		expect(isRedactedStreamUrl('rtmps://live-api-s.facebook.com:443/rtmp/********?ds=1')).toBeTrue();
		expect(isRedactedStreamUrl('rtmp://media.example.com/live/********/')).toBeTrue();
	});

	it('takes a real key as not redacted', () => {
		expect(isRedactedStreamUrl('rtmp://a.rtmp.youtube.com/live2/abcd-1234')).toBeFalse();
	});
});
