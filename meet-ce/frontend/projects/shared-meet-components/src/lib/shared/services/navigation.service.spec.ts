import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { EmbeddedEventName, LeftEventReason } from '@openvidu-meet/typings';
import { EMPTY } from 'rxjs';
import { EmbeddedEventBusService } from '../../domains/embedded/services/embedded-event-bus.service';
import { WcRouteName } from '../../domains/embedded/models/wc-route.model';
import { WcRouterGateway } from '../../domains/embedded/services/wc-router-gateway.service';
import { LeaveRedirectService } from './leave-redirect.service';
import { ListStateCacheService } from './list-state-cache.service';
import { NavigationService } from './navigation.service';
import { RuntimeConfigService } from './runtime-config.service';
import { SessionStorageService } from './session-storage.service';
import { LoggerService } from './logger.service';

class LoggerServiceStub {
	get() {
		return { d: () => {}, w: () => {}, e: () => {} };
	}
}

/**
 * Covers `closeOrLeave`'s MEETING_CLOSED host-event emission gating in embedded modes (the SPA
 * must NOT emit it) and `goToDisconnected`'s view transition. The bus only ever queues the
 * canonical name; dispatching the deprecated `closed` alias is each shell's job, not this
 * service's. The `meetingLeft` event is emitted upstream by
 * MeetingEventHandlerService.onParticipantLeft, so `goToDisconnected` itself must NOT emit.
 */
describe('NavigationService - hosted-mode event gates', () => {
	let service: NavigationService;
	let eventBus: EmbeddedEventBusService;
	let leaveRedirect: LeaveRedirectService;
	let router: { navigate: jasmine.Spy; events: typeof EMPTY };
	let wcRouterGateway: { getHomeRoute: jasmine.Spy; navigate: jasmine.Spy; navigateToInitial: jasmine.Spy };

	// Mutable per-test mode flags read by the runtime-config stub.
	let webcomponentMode: boolean;
	let iframeMode: boolean;

	beforeEach(() => {
		webcomponentMode = false;
		iframeMode = false;
		router = { navigate: jasmine.createSpy('navigate').and.resolveTo(true), events: EMPTY };
		wcRouterGateway = {
			getHomeRoute: jasmine.createSpy('getHomeRoute').and.returnValue(null),
			navigate: jasmine.createSpy('navigate').and.resolveTo(undefined),
			navigateToInitial: jasmine.createSpy('navigateToInitial').and.resolveTo(undefined)
		};

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
				{ provide: ListStateCacheService, useValue: {} as ListStateCacheService },
				{ provide: WcRouterGateway, useValue: wcRouterGateway as unknown as WcRouterGateway }
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
		it('iframe mode with no leave-redirect: emits MEETING_CLOSED and does not navigate', async () => {
			iframeMode = true;

			await service.goBackFromMeeting('/rooms');

			expect(eventBus.emit).toHaveBeenCalledOnceWith({ event: EmbeddedEventName.MEETING_CLOSED });
			expect(router.navigate).not.toHaveBeenCalled();
		});

		it('iframe mode with leave-redirect: emits MEETING_CLOSED and redirects', async () => {
			iframeMode = true;
			spyOn(leaveRedirect, 'getLeaveRedirectURL').and.returnValue('https://host.example.com/done');
			const redirectSpy = spyOn(
				service as unknown as { redirectWindow: (url: string) => void },
				'redirectWindow'
			);

			await service.goBackFromMeeting('/rooms');

			expect(eventBus.emit).toHaveBeenCalledOnceWith({ event: EmbeddedEventName.MEETING_CLOSED });
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

	/**
	 * Bug 1 (MEET-BRANCH-AUDIT-FINDINGS.md A5): re-entering the meeting from the room-recordings
	 * view used to build a bare `{ roomId }` route, silently wiping participantExternalId /
	 * participantMetadata / initial media state even though the host's element attributes never
	 * changed. Reusing the WC router's registered home route (when it's still this same meeting)
	 * carries those params through instead.
	 */
	describe('goBackToRoom() — WC mode reuses the home route when it matches', () => {
		beforeEach(() => {
			webcomponentMode = true;
		});

		it('reuses the full home route params when the home route is this same meeting', async () => {
			const homeRoute = {
				name: WcRouteName.MEETING,
				params: {
					roomId: 'room-1',
					secret: 'sec',
					e2eeKey: 'e2ee',
					participantName: 'Alice',
					participantExternalId: 'ext-1',
					participantMetadata: '{"team":"eng"}',
					initialAudioActive: false,
					initialVideoActive: true,
					leaveRedirectUrl: 'https://host.example.com/done'
				}
			} as const;
			wcRouterGateway.getHomeRoute.and.returnValue(homeRoute);

			await service.goBackToRoom('room-1');

			expect(wcRouterGateway.navigate).toHaveBeenCalledOnceWith(homeRoute);
		});

		it('falls back to a bare route when there is no registered home route', async () => {
			wcRouterGateway.getHomeRoute.and.returnValue(null);

			await service.goBackToRoom('room-1');

			expect(wcRouterGateway.navigate).toHaveBeenCalledOnceWith({
				name: WcRouteName.MEETING,
				params: { roomId: 'room-1' }
			});
		});

		it('falls back to a bare route when the home route is a different room (show-only-recordings never entered this one)', async () => {
			wcRouterGateway.getHomeRoute.and.returnValue({
				name: WcRouteName.MEETING,
				params: { roomId: 'room-other' }
			});

			await service.goBackToRoom('room-1');

			expect(wcRouterGateway.navigate).toHaveBeenCalledOnceWith({
				name: WcRouteName.MEETING,
				params: { roomId: 'room-1' }
			});
		});

		it('falls back to a bare route when the home route is not a meeting (show-only-recordings embed: this button enters the meeting, not resumes it)', async () => {
			wcRouterGateway.getHomeRoute.and.returnValue({
				name: WcRouteName.ROOM_RECORDINGS,
				params: { roomId: 'room-1', secret: 'sec' }
			});

			await service.goBackToRoom('room-1');

			expect(wcRouterGateway.navigate).toHaveBeenCalledOnceWith({
				name: WcRouteName.MEETING,
				params: { roomId: 'room-1' }
			});
		});

		it('SPA mode: still navigates to /room/<roomId> and never touches the WC gateway', async () => {
			webcomponentMode = false;

			await service.goBackToRoom('room-1');

			expect(router.navigate).toHaveBeenCalledWith(['/room/room-1'], jasmine.any(Object));
			expect(wcRouterGateway.navigate).not.toHaveBeenCalled();
		});
	});
});
