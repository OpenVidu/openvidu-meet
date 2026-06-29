import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { LeftEventReason } from '@openvidu-meet/typings';
import { EMPTY } from 'rxjs';
import { LoggerService } from '../../domains/meeting/openvidu-components';
import { WebComponentEventType } from '../models/webcomponent-bridge.model';
import { ListStateCacheService } from './list-state-cache.service';
import { NavigationService } from './navigation.service';
import { RuntimeConfigService } from './runtime-config.service';
import { SessionStorageService } from './session-storage.service';
import { WebComponentBridgeService } from './webcomponent-bridge.service';

class LoggerServiceStub {
	get() {
		return { d: () => {}, w: () => {}, e: () => {} };
	}
}

const ROOM_ID = 'room1';
const IDENTITY = 'participant-1';

/**
 * Covers the host-event emission gates shared by the webcomponent and iframe modes:
 * `goToDisconnected` (LEFT) and `closeOrLeave` (CLOSED). The SPA must NOT emit them.
 */
describe('NavigationService - hosted-mode event gates', () => {
	let service: NavigationService;
	let wcBridge: WebComponentBridgeService;
	let router: { navigate: jasmine.Spy; events: typeof EMPTY };

	// Mutable per-test mode flags read by the runtime-config stub.
	let webcomponentMode: boolean;
	let iframeMode: boolean;

	beforeEach(() => {
		webcomponentMode = false;
		iframeMode = false;
		router = { navigate: jasmine.createSpy('navigate').and.resolveTo(true), events: EMPTY };

		const runtimeConfigStub = {
			isWebcomponentMode: () => webcomponentMode,
			isIframeMode: () => iframeMode,
			isEmbeddedMode: () => webcomponentMode || iframeMode,
			basePath: '/'
		};
		const sessionStorageStub = {
			getRedirectUrl: () => null,
			setRedirectUrl: () => {}
		};

		TestBed.configureTestingModule({
			providers: [
				NavigationService,
				WebComponentBridgeService,
				{ provide: LoggerService, useClass: LoggerServiceStub },
				{ provide: Router, useValue: router as unknown as Router },
				{ provide: RuntimeConfigService, useValue: runtimeConfigStub as unknown as RuntimeConfigService },
				{ provide: SessionStorageService, useValue: sessionStorageStub as unknown as SessionStorageService },
				{ provide: ListStateCacheService, useValue: {} as ListStateCacheService }
			]
		});

		wcBridge = TestBed.inject(WebComponentBridgeService);
		spyOn(wcBridge, 'emitWebComponentEvent').and.callThrough();
		service = TestBed.inject(NavigationService);
	});

	describe('goToDisconnected()', () => {
		const detail = { roomId: ROOM_ID, participantIdentity: IDENTITY, reason: LeftEventReason.VOLUNTARY_LEAVE };

		it('iframe mode: emits LEFT to the host AND navigates to /disconnected', async () => {
			iframeMode = true;

			await service.goToDisconnected(detail);

			expect(wcBridge.emitWebComponentEvent).toHaveBeenCalledOnceWith({
				type: WebComponentEventType.LEFT,
				...detail
			});
			expect(router.navigate).toHaveBeenCalledWith(
				['/disconnected'],
				jasmine.objectContaining({ queryParams: { reason: LeftEventReason.VOLUNTARY_LEAVE } })
			);
		});

		it('SPA mode: navigates to /disconnected WITHOUT emitting a host event', async () => {
			await service.goToDisconnected(detail);

			expect(wcBridge.emitWebComponentEvent).not.toHaveBeenCalled();
			expect(router.navigate).toHaveBeenCalledWith(['/disconnected'], jasmine.any(Object));
		});
	});

	describe('goBackFromMeeting() → closeOrLeave()', () => {
		it('iframe mode with no leave-redirect: emits CLOSED and does not navigate', async () => {
			iframeMode = true;

			await service.goBackFromMeeting('/rooms');

			expect(wcBridge.emitWebComponentEvent).toHaveBeenCalledOnceWith({ type: WebComponentEventType.CLOSED });
			expect(router.navigate).not.toHaveBeenCalled();
		});

		it('iframe mode with leave-redirect: emits CLOSED and redirects', async () => {
			iframeMode = true;
			spyOn(service, 'getLeaveRedirectURL').and.returnValue('https://host.example.com/done');
			const redirectSpy = spyOn(
				service as unknown as { redirectWindow: (url: string) => void },
				'redirectWindow'
			);

			await service.goBackFromMeeting('/rooms');

			expect(wcBridge.emitWebComponentEvent).toHaveBeenCalledOnceWith({ type: WebComponentEventType.CLOSED });
			expect(redirectSpy).toHaveBeenCalledOnceWith('https://host.example.com/done');
			expect(router.navigate).not.toHaveBeenCalled();
		});

		it('SPA mode with no leave-redirect: navigates to the fallback route, no host event', async () => {
			await service.goBackFromMeeting('/rooms');

			expect(wcBridge.emitWebComponentEvent).not.toHaveBeenCalled();
			expect(router.navigate).toHaveBeenCalledWith(['/rooms'], jasmine.any(Object));
		});
	});

	describe('redirectToLeaveUrl()', () => {
		// `redirectWindow` targets `window.top ?? window`, so it routes to the host window when
		// embedded and to the current window otherwise. Spy the seam to assert navigation
		// happens (or not) without actually navigating the test runner.
		it('navigates to a valid external leave-redirect URL', async () => {
			spyOn(service, 'getLeaveRedirectURL').and.returnValue('https://host.example.com/done');
			const redirectSpy = spyOn(
				service as unknown as { redirectWindow: (url: string) => void },
				'redirectWindow'
			);

			await service.redirectToLeaveUrl();

			expect(redirectSpy).toHaveBeenCalledOnceWith('https://host.example.com/done');
		});

		it('does nothing when no leave-redirect URL is configured', async () => {
			spyOn(service, 'getLeaveRedirectURL').and.returnValue(undefined);
			const redirectSpy = spyOn(
				service as unknown as { redirectWindow: (url: string) => void },
				'redirectWindow'
			);

			await service.redirectToLeaveUrl();

			expect(redirectSpy).not.toHaveBeenCalled();
		});

		it('refuses a non-external (relative) redirect URL', async () => {
			spyOn(service, 'getLeaveRedirectURL').and.returnValue('/not-absolute');
			const redirectSpy = spyOn(
				service as unknown as { redirectWindow: (url: string) => void },
				'redirectWindow'
			);

			await service.redirectToLeaveUrl();

			expect(redirectSpy).not.toHaveBeenCalled();
		});
	});

	describe('handleLeaveRedirectUrl() — per-mode resolution', () => {
		let setSpy: jasmine.Spy;

		beforeEach(() => {
			// Spy on the (protected) setter so we capture the resolved URL without
			// touching session storage or the real property.
			setSpy = spyOn(service as unknown as { setLeaveRedirectUrl: (u: string) => void }, 'setLeaveRedirectUrl');
		});

		it('uses an absolute URL as-is', () => {
			service.handleLeaveRedirectUrl('https://app.example.com/done');

			expect(setSpy).toHaveBeenCalledOnceWith('https://app.example.com/done');
		});

		it('webcomponent mode: resolves a relative path against window.location.origin', () => {
			webcomponentMode = true;

			service.handleLeaveRedirectUrl('/goodbye');

			expect(setSpy).toHaveBeenCalledOnceWith(`${window.location.origin}/goodbye`);
		});

		it('iframe mode: resolves a relative path against the referrer (host) origin', () => {
			iframeMode = true;
			spyOn(
				service as unknown as { getReferrerOrigin: () => string | null },
				'getReferrerOrigin'
			).and.returnValue('https://host.example.com');

			service.handleLeaveRedirectUrl('/goodbye');

			expect(setSpy).toHaveBeenCalledOnceWith('https://host.example.com/goodbye');
		});

		it('iframe mode: ignores a relative path when the referrer origin is unknown', () => {
			iframeMode = true;
			spyOn(
				service as unknown as { getReferrerOrigin: () => string | null },
				'getReferrerOrigin'
			).and.returnValue(null);

			service.handleLeaveRedirectUrl('/goodbye');

			expect(setSpy).not.toHaveBeenCalled();
		});

		it('standalone SPA: auto-detects the redirect from the referrer when no URL is given', () => {
			spyOn(
				service as unknown as { getAutoRedirectUrl: () => string | null },
				'getAutoRedirectUrl'
			).and.returnValue('https://referrer.example.com');

			service.handleLeaveRedirectUrl(undefined);

			expect(setSpy).toHaveBeenCalledOnceWith('https://referrer.example.com');
		});

		it('iframe mode: does NOT auto-detect when no URL is given', () => {
			iframeMode = true;
			const autoSpy = spyOn(
				service as unknown as { getAutoRedirectUrl: () => string | null },
				'getAutoRedirectUrl'
			).and.returnValue('https://referrer.example.com');

			service.handleLeaveRedirectUrl(undefined);

			expect(autoSpy).not.toHaveBeenCalled();
			expect(setSpy).not.toHaveBeenCalled();
		});
	});
});
