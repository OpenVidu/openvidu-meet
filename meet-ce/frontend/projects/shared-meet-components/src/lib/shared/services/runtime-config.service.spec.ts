import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RuntimeConfigService } from './runtime-config.service';

describe('RuntimeConfigService - isIframeMode', () => {
	let service: RuntimeConfigService;

	beforeEach(() => {
		TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), RuntimeConfigService] });
		service = TestBed.inject(RuntimeConfigService);
	});

	it('reflects whether the document is embedded in an iframe when not in webcomponent mode', () => {
		// Detection mirrors `window.self !== window.top`; derive the expectation the same way
		// so the assertion holds regardless of how the test runner frames the page.
		const embedded = window.self !== window.top;
		expect(service.isIframeMode()).toBe(embedded);
	});

	it('is false once webcomponent mode is enabled (the two embedded modes never overlap)', () => {
		service.enableWebcomponentMode();
		expect(service.isIframeMode()).toBeFalse();
	});

	it('is false after setServerBaseUrl, which also enables webcomponent mode', () => {
		service.setServerBaseUrl('https://meet.example.com');
		expect(service.isIframeMode()).toBeFalse();
	});
});

/**
 * Meet is served from the root in one deployment and from `/meet` in another, and as a
 * webcomponent it is served from a different origin altogether. Every asset and API url the app
 * builds goes through here, so the wrong prefix is a blank page rather than a subtle bug.
 */
describe('RuntimeConfigService - where the app is served from', () => {
	let originalConfig: Window['__OPENVIDU_MEET_CONFIG__'];
	let originalBase: HTMLBaseElement | null;

	const createService = (): RuntimeConfigService => {
		TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), RuntimeConfigService] });
		return TestBed.inject(RuntimeConfigService);
	};

	const declareBaseHref = (href: string): void => {
		const element = document.createElement('base');
		element.setAttribute('href', href);
		document.head.appendChild(element);
	};

	beforeEach(() => {
		originalConfig = window.__OPENVIDU_MEET_CONFIG__;
		originalBase = document.querySelector('base');
		originalBase?.remove();
		delete window.__OPENVIDU_MEET_CONFIG__;
	});

	afterEach(() => {
		document.querySelector('base')?.remove();

		if (originalBase) {
			document.head.appendChild(originalBase);
		}

		if (originalConfig) {
			window.__OPENVIDU_MEET_CONFIG__ = originalConfig;
		} else {
			delete window.__OPENVIDU_MEET_CONFIG__;
		}
	});

	it('takes the base path the deployment injected', () => {
		window.__OPENVIDU_MEET_CONFIG__ = { basePath: '/meet' };
		declareBaseHref('/ignored/');

		expect(createService().basePath).toBe('/meet');
	});

	it("falls back to the document's base href", () => {
		declareBaseHref('/meet-from-base/');

		expect(createService().basePath).toBe('/meet-from-base/');
	});

	it('serves from the root when nothing says otherwise', () => {
		expect(createService().basePath).toBe('/');
	});

	it('prefixes app paths with the base path, and only once', () => {
		window.__OPENVIDU_MEET_CONFIG__ = { basePath: '/meet/' };
		const service = createService();

		expect(service.resolveUrl('assets/sounds/x.mp3')).toBe('/meet/assets/sounds/x.mp3');
		expect(service.resolveUrl('/meet/assets/sounds/x.mp3')).toBe('/meet/assets/sounds/x.mp3');
		expect(service.stripBasePath('/meet/room/abc')).toBe('/room/abc');
	});

	it('leaves a fully qualified url alone', () => {
		window.__OPENVIDU_MEET_CONFIG__ = { basePath: '/meet' };

		expect(createService().resolveUrl('https://cdn.example.com/x.mp3')).toBe('https://cdn.example.com/x.mp3');
	});

	// The url comes from the host's `room-url` attribute, which may or may not end in a slash.
	it('drops the trailing slash of the server url so paths do not double up a separator', () => {
		const service = createService();

		service.setServerBaseUrl('https://meet.example.com/meet/');

		expect(service.serverBaseUrl()).toBe('https://meet.example.com/meet');
		expect(service.resolveUrl('assets/sounds/x.mp3')).toBe('https://meet.example.com/meet/assets/sounds/x.mp3');
	});
});
