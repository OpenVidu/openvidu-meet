import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PlatformService } from './platform.service';

const ANDROID_PHONE_CHROME =
	'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const ANDROID_TABLET_CHROME =
	'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const IPHONE_SAFARI =
	'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME =
	'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.0.0 Mobile/15E148 Safari/604.1';
const MAC_SAFARI =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const LINUX_CHROME =
	'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const WINDOWS_EDGE =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0';
const LINUX_FIREFOX = 'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0';

describe('PlatformService', () => {
	function platformOf(userAgent: string): PlatformService {
		spyOnProperty(navigator, 'userAgent', 'get').and.returnValue(userAgent);
		TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });

		return TestBed.inject(PlatformService);
	}

	describe('capturing a second device next to the open one', () => {
		const cases = [
			{ browser: 'Chrome on Linux', userAgent: LINUX_CHROME, camera: true, microphone: true },
			{ browser: 'Edge on Windows', userAgent: WINDOWS_EDGE, camera: true, microphone: true },
			{ browser: 'Firefox on Linux', userAgent: LINUX_FIREFOX, camera: true, microphone: true },
			{ browser: 'Safari on a Mac', userAgent: MAC_SAFARI, camera: true, microphone: false },
			{
				browser: 'Chrome on an Android phone',
				userAgent: ANDROID_PHONE_CHROME,
				camera: false,
				microphone: false
			},
			{
				browser: 'Chrome on an Android tablet',
				userAgent: ANDROID_TABLET_CHROME,
				camera: false,
				microphone: false
			},
			{ browser: 'Safari on an iPhone', userAgent: IPHONE_SAFARI, camera: false, microphone: false },
			{ browser: 'Chrome on an iPhone', userAgent: IPHONE_CHROME, camera: false, microphone: false }
		];

		for (const { browser, userAgent, camera, microphone } of cases) {
			it(`${browser}: camera ${camera}, microphone ${microphone}`, () => {
				const platform = platformOf(userAgent);

				expect(platform.canCaptureSecondCamera()).toBe(camera);
				expect(platform.canCaptureSecondMicrophone()).toBe(microphone);
			});
		}

		it('an iPad asking for the desktop site is not a computer', () => {
			(document as unknown as { ontouchend: null }).ontouchend = null;

			try {
				const platform = platformOf(MAC_SAFARI);

				expect(platform.canCaptureSecondCamera()).toBeFalse();
				expect(platform.canCaptureSecondMicrophone()).toBeFalse();
			} finally {
				delete (document as unknown as { ontouchend?: null }).ontouchend;
			}
		});
	});
});
