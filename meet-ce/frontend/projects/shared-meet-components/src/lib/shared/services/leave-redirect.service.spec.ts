import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LeaveRedirectService } from './leave-redirect.service';
import { RuntimeConfigService } from './runtime-config.service';
import { SessionStorageService } from './session-storage.service';

describe('LeaveRedirectService', () => {
	let service: LeaveRedirectService;
	let stored: { roomId: string; url: string } | null;

	// Mutable per-test mode flags read by the runtime-config stub.
	let webcomponentMode: boolean;
	let iframeMode: boolean;

	// A fresh service instance on the same tab storage, as after a page reload.
	const reload = (): LeaveRedirectService => {
		TestBed.resetTestingModule();
		configure();
		return TestBed.inject(LeaveRedirectService);
	};

	const configure = (): void => {
		const runtimeConfigStub = {
			isWebcomponentMode: () => webcomponentMode,
			isIframeMode: () => iframeMode,
			isEmbeddedMode: () => webcomponentMode || iframeMode
		};
		const sessionStorageStub = {
			getRedirect: () => stored,
			setRedirect: (roomId: string, url: string) => (stored = { roomId, url }),
			removeRedirectUrl: () => (stored = null)
		};

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				LeaveRedirectService,
				{ provide: RuntimeConfigService, useValue: runtimeConfigStub as unknown as RuntimeConfigService },
				{ provide: SessionStorageService, useValue: sessionStorageStub as unknown as SessionStorageService }
			]
		});
	};

	// Override the read-only `document.referrer` getter for the duration of a test; the referrer
	// resolution lives in the pure url.utils helpers, which read document.referrer directly.
	const stubReferrer = (value: string): void => {
		Object.defineProperty(document, 'referrer', { configurable: true, get: () => value });
	};

	beforeEach(() => {
		webcomponentMode = false;
		iframeMode = false;
		stored = null;
		stubReferrer('');
		configure();
		service = TestBed.inject(LeaveRedirectService);
	});

	afterEach(() => {
		// Drop the per-test override of the (normally read-only) document.referrer getter.
		delete (document as { referrer?: unknown }).referrer;
	});

	describe('handleLeaveRedirectUrl() — per-mode resolution', () => {
		it('uses an absolute URL as-is and stores it with its room', () => {
			service.handleLeaveRedirectUrl('room-a', 'https://app.example.com/done');

			expect(service.getLeaveRedirectURL()).toBe('https://app.example.com/done');
			expect(stored).toEqual({ roomId: 'room-a', url: 'https://app.example.com/done' });
		});

		it('webcomponent mode: resolves a relative path against window.location.origin', () => {
			webcomponentMode = true;

			service.handleLeaveRedirectUrl('room-a', '/goodbye');

			expect(service.getLeaveRedirectURL()).toBe(`${window.location.origin}/goodbye`);
		});

		it('iframe mode: resolves a relative path against the referrer (host) origin', () => {
			iframeMode = true;
			stubReferrer('https://host.example.com/embedding-page');

			service.handleLeaveRedirectUrl('room-a', '/goodbye');

			expect(service.getLeaveRedirectURL()).toBe('https://host.example.com/goodbye');
		});

		it('iframe mode: ignores a relative path when the referrer origin is unknown', () => {
			iframeMode = true;

			service.handleLeaveRedirectUrl('room-a', '/goodbye');

			expect(service.getLeaveRedirectURL()).toBeUndefined();
		});

		it('standalone SPA: auto-detects the redirect from the referrer when no URL is given', () => {
			// A referrer on a different origin than the test runner triggers auto-detection.
			stubReferrer('https://referrer.example.com/');

			service.handleLeaveRedirectUrl('room-a', undefined);

			expect(service.getLeaveRedirectURL()).toBe('https://referrer.example.com/');
		});

		it('iframe mode: does NOT auto-detect when no URL is given', () => {
			iframeMode = true;
			stubReferrer('https://referrer.example.com/');

			service.handleLeaveRedirectUrl('room-a', undefined);

			expect(service.getLeaveRedirectURL()).toBeUndefined();
		});
	});

	describe('handleLeaveRedirectUrl() — one redirect per entry', () => {
		it('webcomponent mode: an entry without a URL drops the one of the earlier entry, stored too', () => {
			webcomponentMode = true;
			service.handleLeaveRedirectUrl('room-a', 'https://app.example.com/a');

			service.handleLeaveRedirectUrl('room-b', undefined);

			expect(service.getLeaveRedirectURL()).toBeUndefined();
			expect(stored).toBeNull();
		});

		it('iframe mode: a new iframe without a URL ignores the one an earlier iframe of the tab stored', () => {
			iframeMode = true;
			service.handleLeaveRedirectUrl('room-a', 'https://app.example.com/a');

			const replaced = reload();
			replaced.handleLeaveRedirectUrl('room-b', undefined);

			expect(replaced.getLeaveRedirectURL()).toBeUndefined();
		});

		it('webcomponent mode: an entry without a URL has none even on the same room', () => {
			webcomponentMode = true;
			service.handleLeaveRedirectUrl('room-a', 'https://app.example.com/a');

			service.handleLeaveRedirectUrl('room-a', undefined);

			expect(service.getLeaveRedirectURL()).toBeUndefined();
		});

		it('standalone SPA: a reload of the same room keeps its redirect', () => {
			service.handleLeaveRedirectUrl('room-a', 'https://app.example.com/a');

			const reloaded = reload();
			reloaded.handleLeaveRedirectUrl('room-a', undefined);

			expect(reloaded.getLeaveRedirectURL()).toBe('https://app.example.com/a');
		});

		it('standalone SPA: an entry to another room without a URL does not take the stored one', () => {
			service.handleLeaveRedirectUrl('room-a', 'https://app.example.com/a');

			const reloaded = reload();
			reloaded.handleLeaveRedirectUrl('room-b', undefined);

			expect(reloaded.getLeaveRedirectURL()).toBeUndefined();
			expect(stored).toBeNull();
		});
	});

	describe('getLeaveRedirectURL()', () => {
		it('falls back to the stored URL after a reload outside a meeting entry', () => {
			stored = { roomId: 'room-a', url: 'https://stored.example.com/back' };

			expect(service.getLeaveRedirectURL()).toBe('https://stored.example.com/back');
		});

		it('returns undefined when nothing is set or stored', () => {
			expect(service.getLeaveRedirectURL()).toBeUndefined();
		});
	});
});
