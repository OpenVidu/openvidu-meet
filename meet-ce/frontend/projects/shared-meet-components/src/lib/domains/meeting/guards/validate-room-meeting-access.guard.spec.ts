import { EnvironmentInjector, provideZonelessChangeDetection, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree } from '@angular/router';
import { NavigationErrorReason } from '../../../shared/models/navigation.model';
import { NavigationService } from '../../../shared/services/navigation.service';
import { RoomAccessService } from '../../rooms/services/room-access.service';
import { validateRoomMeetingAccessGuard } from './validate-room-meeting-access.guard';

describe('validateRoomMeetingAccessGuard', () => {
	let resolveAccess: (result: { allowed: boolean; reason?: NavigationErrorReason }) => void;
	let loadComponent: jasmine.Spy;
	let errorPage: UrlTree;

	const runGuard = () =>
		runInInjectionContext(TestBed.inject(EnvironmentInjector), () =>
			validateRoomMeetingAccessGuard(
				{ routeConfig: { path: 'room/:room-id', loadComponent } } as unknown as ActivatedRouteSnapshot,
				{} as RouterStateSnapshot
			)
		) as Promise<boolean | UrlTree>;

	beforeEach(() => {
		loadComponent = jasmine.createSpy('loadComponent').and.resolveTo(class {});
		errorPage = new UrlTree();

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				{
					provide: RoomAccessService,
					useValue: { validateAccess: () => new Promise((resolve) => (resolveAccess = resolve)) }
				},
				{ provide: NavigationService, useValue: { redirectToErrorPage: async () => errorPage } }
			]
		});
	});

	it('starts loading the meeting page while the access is still being checked', async () => {
		const result = runGuard();

		expect(loadComponent).toHaveBeenCalledTimes(1);

		resolveAccess({ allowed: true });
		expect(await result).toBeTrue();
	});

	it('redirects to the error page when the access is refused, whatever the page download does', async () => {
		loadComponent.and.rejectWith(new Error('chunk failed'));
		const result = runGuard();

		resolveAccess({ allowed: false, reason: NavigationErrorReason.INVALID_ROOM });
		expect(await result).toBe(errorPage);
	});
});
