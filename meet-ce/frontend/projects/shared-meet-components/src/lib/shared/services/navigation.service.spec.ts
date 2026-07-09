import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { EmbeddedEventName, LeftEventReason } from '@openvidu-meet/typings';
import { EMPTY } from 'rxjs';
import { EmbeddedEventBusService } from '../../domains/embedded/services/embedded-event-bus.service';
import { LoggerService } from '../../domains/meeting/openvidu-components';
import { LeaveRedirectService } from './leave-redirect.service';
import { ListStateCacheService } from './list-state-cache.service';
import { NavigationService } from './navigation.service';
import { RuntimeConfigService } from './runtime-config.service';
import { SessionStorageService } from './session-storage.service';

class LoggerServiceStub {
	get() {
		return { d: () => {}, w: () => {}, e: () => {} };
	}
}

/**
 * Covers `closeOrLeave`'s CLOSED host-event emission gating in embedded modes (the SPA must NOT
 * emit it) and `goToDisconnected`'s view transition. The `left` event is emitted upstream by
 * MeetingEventHandlerService.onParticipantLeft, so `goToDisconnected` itself must NOT emit.
 */
describe('NavigationService - hosted-mode event gates', () => {
	let service: NavigationService;
	let eventBus: EmbeddedEventBusService;
	let leaveRedirect: LeaveRedirectService;
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
				provideZonelessChangeDetection(),
				NavigationService,
				LeaveRedirectService,
				EmbeddedEventBusService,
				{ provide: LoggerService, useClass: LoggerServiceStub },
				{ provide: Router, useValue: router as unknown as Router },
				{ provide: RuntimeConfigService, useValue: runtimeConfigStub as unknown as RuntimeConfigService },
				{ provide: SessionStorageService, useValue: sessionStorageStub as unknown as SessionStorageService },
				{ provide: ListStateCacheService, useValue: {} as ListStateCacheService }
			]
		});

		eventBus = TestBed.inject(EmbeddedEventBusService);
		spyOn(eventBus, 'emit').and.callThrough();
		service = TestBed.inject(NavigationService);
		leaveRedirect = TestBed.inject(LeaveRedirectService);
	});

	describe('goToDisconnected()', () => {
		it('navigates to /disconnected', async () => {
			await service.goToDisconnected(LeftEventReason.VOLUNTARY_LEAVE);

			expect(router.navigate).toHaveBeenCalledWith(
				['/disconnected'],
				jasmine.objectContaining({ queryParams: { reason: LeftEventReason.VOLUNTARY_LEAVE } })
			);
		});
	});

	describe('goBackFromMeeting() → closeOrLeave()', () => {
		it('iframe mode with no leave-redirect: emits CLOSED and does not navigate', async () => {
			iframeMode = true;

			await service.goBackFromMeeting('/rooms');

			expect(eventBus.emit).toHaveBeenCalledOnceWith({ event: EmbeddedEventName.CLOSED });
			expect(router.navigate).not.toHaveBeenCalled();
		});

		it('iframe mode with leave-redirect: emits CLOSED and redirects', async () => {
			iframeMode = true;
			spyOn(leaveRedirect, 'getLeaveRedirectURL').and.returnValue('https://host.example.com/done');
			const redirectSpy = spyOn(
				service as unknown as { redirectWindow: (url: string) => void },
				'redirectWindow'
			);

			await service.goBackFromMeeting('/rooms');

			expect(eventBus.emit).toHaveBeenCalledOnceWith({ event: EmbeddedEventName.CLOSED });
			expect(redirectSpy).toHaveBeenCalledOnceWith('https://host.example.com/done');
			expect(router.navigate).not.toHaveBeenCalled();
		});

		it('SPA mode with no leave-redirect: navigates to the fallback route, no host event', async () => {
			await service.goBackFromMeeting('/rooms');

			expect(eventBus.emit).not.toHaveBeenCalled();
			expect(router.navigate).toHaveBeenCalledWith(['/rooms'], jasmine.any(Object));
		});
	});

	describe('redirectToLeaveUrl()', () => {
		// `redirectWindow` targets `window.top ?? window`, so it routes to the host window when
		// embedded and to the current window otherwise. Spy the seam to assert navigation
		// happens (or not) without actually navigating the test runner.
		it('navigates to a valid external leave-redirect URL', async () => {
			spyOn(leaveRedirect, 'getLeaveRedirectURL').and.returnValue('https://host.example.com/done');
			const redirectSpy = spyOn(
				service as unknown as { redirectWindow: (url: string) => void },
				'redirectWindow'
			);

			await service.redirectToLeaveUrl();

			expect(redirectSpy).toHaveBeenCalledOnceWith('https://host.example.com/done');
		});

		it('does nothing when no leave-redirect URL is configured', async () => {
			spyOn(leaveRedirect, 'getLeaveRedirectURL').and.returnValue(undefined);
			const redirectSpy = spyOn(
				service as unknown as { redirectWindow: (url: string) => void },
				'redirectWindow'
			);

			await service.redirectToLeaveUrl();

			expect(redirectSpy).not.toHaveBeenCalled();
		});

		it('refuses a non-external (relative) redirect URL', async () => {
			spyOn(leaveRedirect, 'getLeaveRedirectURL').and.returnValue('/not-absolute');
			const redirectSpy = spyOn(
				service as unknown as { redirectWindow: (url: string) => void },
				'redirectWindow'
			);

			await service.redirectToLeaveUrl();

			expect(redirectSpy).not.toHaveBeenCalled();
		});
	});

});
