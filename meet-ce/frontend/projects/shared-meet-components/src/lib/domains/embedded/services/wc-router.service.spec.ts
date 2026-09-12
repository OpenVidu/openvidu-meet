import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { WcGuardResult, WcMeetingGuard, WcRoomRecordingsGuard, WcSingleRecordingGuard } from '../guards/wc-route-guards';
import { MeetingRoute, WcRouteName } from '../models/wc-route.model';
import { WcRouterService } from './wc-router.service';

const meetingRoute = (params: MeetingRoute['params']): MeetingRoute => ({ name: WcRouteName.MEETING, params });

/**
 * Bug 2 (MEET-BRANCH-AUDIT-FINDINGS.md A5): the home route used to be registered only when the
 * attribute-derived identity (room/recording) changed, freezing it at the first snapshot — later
 * non-identity attribute changes (participant name/metadata, initial media…) never reached the
 * stored home, so navigateToInitial() (post-login resume) and goBackToRoom() replayed stale params.
 * syncHomeRoute now always refreshes the stored home and gates only the *navigation* on identity.
 */
describe('WcRouterService.syncHomeRoute', () => {
	let service: WcRouterService;
	let meetingGuard: jasmine.SpyObj<WcMeetingGuard>;

	beforeEach(() => {
		meetingGuard = jasmine.createSpyObj<WcMeetingGuard>('WcMeetingGuard', ['canActivate']);
		meetingGuard.canActivate.and.resolveTo({ kind: 'ready' });

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				WcRouterService,
				{ provide: WcMeetingGuard, useValue: meetingGuard },
				{ provide: WcSingleRecordingGuard, useValue: { canActivate: () => ({ kind: 'ready' }) } },
				{ provide: WcRoomRecordingsGuard, useValue: { canActivate: () => ({ kind: 'ready' }) } }
			]
		});

		service = TestBed.inject(WcRouterService);
	});

	it('navigates and registers the home on the first sync', async () => {
		const route = meetingRoute({ roomId: 'room-1', participantName: 'Alice' });

		await service.syncHomeRoute(route);

		expect(meetingGuard.canActivate).toHaveBeenCalledOnceWith(route);
		expect(service.currentRoute()).toBe(route);
		expect(service.status()).toBe('ready');
		expect(service.getHomeRoute()).toBe(route);
	});

	it('refreshes the stored home WITHOUT re-navigating when only non-identity params change', async () => {
		await service.syncHomeRoute(meetingRoute({ roomId: 'room-1', participantName: 'Alice' }));
		meetingGuard.canActivate.calls.reset();

		const updated = meetingRoute({ roomId: 'room-1', participantName: 'Alicia García' });
		await service.syncHomeRoute(updated);

		expect(meetingGuard.canActivate).not.toHaveBeenCalled();
		expect(service.getHomeRoute()).toBe(updated);
	});

	it('re-navigates when the identity (room) changes', async () => {
		await service.syncHomeRoute(meetingRoute({ roomId: 'room-1' }));

		const other = meetingRoute({ roomId: 'room-2' });
		await service.syncHomeRoute(other);

		expect(meetingGuard.canActivate).toHaveBeenCalledTimes(2);
		expect(service.currentRoute()).toBe(other);
		expect(service.getHomeRoute()).toBe(other);
	});

	it('navigateToInitial() replays the freshest home (post-login resume with up-to-date attributes)', async () => {
		await service.syncHomeRoute(meetingRoute({ roomId: 'room-1', participantName: 'Alice' }));
		const updated = meetingRoute({ roomId: 'room-1', participantName: 'Alicia García' });
		await service.syncHomeRoute(updated);
		meetingGuard.canActivate.calls.reset();

		await service.navigateToInitial();

		expect(meetingGuard.canActivate).toHaveBeenCalledOnceWith(updated);
	});
});

/** This service outlives a single mount of `<openvidu-meet>` (shared root injector), so `reset()` must return it to a clean slate for the next mount. */
describe('WcRouterService.reset', () => {
	let service: WcRouterService;
	let meetingGuard: jasmine.SpyObj<WcMeetingGuard>;

	beforeEach(() => {
		meetingGuard = jasmine.createSpyObj<WcMeetingGuard>('WcMeetingGuard', ['canActivate']);
		meetingGuard.canActivate.and.resolveTo({ kind: 'ready' });

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				WcRouterService,
				{ provide: WcMeetingGuard, useValue: meetingGuard },
				{ provide: WcSingleRecordingGuard, useValue: { canActivate: () => ({ kind: 'ready' }) } },
				{ provide: WcRoomRecordingsGuard, useValue: { canActivate: () => ({ kind: 'ready' }) } }
			]
		});

		service = TestBed.inject(WcRouterService);
	});

	it('clears the current route, status and home route', async () => {
		await service.syncHomeRoute(meetingRoute({ roomId: 'room-1' }));

		service.reset();

		expect(service.currentRoute()).toBeNull();
		expect(service.status()).toBe('running');
		expect(service.getHomeRoute()).toBeNull();
	});

	it('lets a remount of the SAME room re-navigate instead of being treated as a no-op', async () => {
		const first = meetingRoute({ roomId: 'room-1', participantName: 'Alice' });
		await service.syncHomeRoute(first);

		service.reset();
		meetingGuard.canActivate.calls.reset();

		const remounted = meetingRoute({ roomId: 'room-1', participantName: 'Bob' });
		await service.syncHomeRoute(remounted);

		expect(meetingGuard.canActivate).toHaveBeenCalledOnceWith(remounted);
		expect(service.currentRoute()).toBe(remounted);
		expect(service.status()).toBe('ready');
	});

	it('discards a navigation left in flight by the destroyed instance', async () => {
		let resolveGuard!: (result: WcGuardResult) => void;
		meetingGuard.canActivate.and.returnValue(new Promise((resolve) => (resolveGuard = resolve)));

		const stale = meetingRoute({ roomId: 'room-1' });
		const pending = service.syncHomeRoute(stale);

		service.reset();
		resolveGuard({ kind: 'ready' });
		await pending;

		expect(service.currentRoute()).toBeNull();
		expect(service.status()).toBe('running');
	});
});
