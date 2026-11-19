import { EnvironmentInjector, provideZonelessChangeDetection, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, CanActivateFn, Route, RouterStateSnapshot, UrlTree } from '@angular/router';
import { MeetUserRole } from '@openvidu-meet/typings';
import { NavigationService } from '../../../shared/services/navigation.service';
import { AuthService } from '../../auth/services/auth.service';
import { consoleDomainRoutes } from './console.routes';

describe('console routes by user role', () => {
	let role: MeetUserRole;

	const redirectTo = (route: string) => ({ route }) as unknown as UrlTree;

	const consoleRoutes: Route[] = consoleDomainRoutes[0].children!;
	const routeOf = (path: string) => consoleRoutes.find((route) => route.path === path)!;

	const open = async (path: string): Promise<boolean | UrlTree> => {
		const guards = (routeOf(path).canActivate ?? []) as CanActivateFn[];

		for (const guard of guards) {
			const result = await runInInjectionContext(TestBed.inject(EnvironmentInjector), () =>
				guard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot)
			);

			if (result !== true) return result as boolean | UrlTree;
		}

		return true;
	};

	beforeEach(() => {
		role = MeetUserRole.ADMIN;

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				{ provide: AuthService, useValue: { getUserRole: async () => role } },
				{ provide: NavigationService, useValue: { createRedirectionTo: redirectTo } }
			]
		});
	});

	describe('admin-only pages', () => {
		['overview', 'embedded', 'config', 'users'].forEach((path) => {
			it(`opens ${path} for an admin`, async () => {
				expect(await open(path)).toBeTrue();
			});

			[MeetUserRole.ROOM_MANAGER, MeetUserRole.ROOM_MEMBER].forEach((nonAdmin) => {
				it(`sends a ${nonAdmin} who types the address of ${path} to the rooms page`, async () => {
					role = nonAdmin;

					expect(await open(path)).toEqual(redirectTo('/rooms'));
				});
			});
		});
	});

	describe('landing page', () => {
		it('opens the overview from the console root, and from a path that matches no page', () => {
			expect(routeOf('').redirectTo).toBe('overview');
			expect(routeOf('**').redirectTo).toBe('overview');
		});

		it('shows the overview to an admin', async () => {
			expect(await open(routeOf('').redirectTo as string)).toBeTrue();
		});

		[MeetUserRole.ROOM_MANAGER, MeetUserRole.ROOM_MEMBER].forEach((nonAdmin) => {
			it(`lands a ${nonAdmin} on the rooms page`, async () => {
				role = nonAdmin;

				expect(await open(routeOf('').redirectTo as string)).toEqual(redirectTo('/rooms'));
			});
		});
	});
});
