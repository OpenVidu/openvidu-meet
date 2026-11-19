import { EnvironmentInjector, provideZonelessChangeDetection, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree } from '@angular/router';
import { MeetUserRole } from '@openvidu-meet/typings';
import { NavigationService } from '../../../shared/services/navigation.service';
import { SessionStorageService } from '../../../shared/services/session-storage.service';
import { AuthService } from '../services/auth.service';
import { checkRoleGuard, checkUserNotAuthenticatedGuard } from './auth.guard';

describe('auth guards', () => {
	let role: MeetUserRole | undefined;
	let authenticated: boolean;
	let mustChangePassword: boolean;

	const redirectTo = (route: string) => ({ route }) as unknown as UrlTree;

	const run = (guard: ReturnType<typeof checkRoleGuard>) =>
		runInInjectionContext(TestBed.inject(EnvironmentInjector), () =>
			guard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot)
		) as Promise<boolean | UrlTree>;

	beforeEach(() => {
		role = undefined;
		authenticated = true;
		mustChangePassword = false;

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				{
					provide: AuthService,
					useValue: { getUserRole: async () => role, isUserAuthenticated: async () => authenticated }
				},
				{ provide: NavigationService, useValue: { createRedirectionTo: redirectTo } },
				{
					provide: SessionStorageService,
					useValue: { getMustChangePasswordRequired: () => mustChangePassword }
				}
			]
		});
	});

	describe('checkRoleGuard', () => {
		const adminOnly = checkRoleGuard([MeetUserRole.ADMIN]);

		it('lets an admin into an admin-only page', async () => {
			role = MeetUserRole.ADMIN;

			expect(await run(adminOnly)).toBeTrue();
		});

		[MeetUserRole.ROOM_MANAGER, MeetUserRole.ROOM_MEMBER].forEach((nonAdmin) => {
			it(`sends a ${nonAdmin} who opens an admin-only page to the rooms page`, async () => {
				role = nonAdmin;

				expect(await run(adminOnly)).toEqual(redirectTo('/rooms'));
			});
		});

		it('sends a user without a role to the rooms page', async () => {
			expect(await run(adminOnly)).toEqual(redirectTo('/rooms'));
		});

		it('lets in every role the page allows', async () => {
			role = MeetUserRole.ROOM_MEMBER;

			expect(await run(checkRoleGuard([MeetUserRole.ROOM_MANAGER, MeetUserRole.ROOM_MEMBER]))).toBeTrue();
		});
	});

	describe('checkUserNotAuthenticatedGuard', () => {
		it('lets a signed-out visitor open the login page', async () => {
			authenticated = false;

			expect(await run(checkUserNotAuthenticatedGuard)).toBeTrue();
		});

		it('sends a signed-in user who opens the login page to the console', async () => {
			expect(await run(checkUserNotAuthenticatedGuard)).toEqual(redirectTo('/'));
		});

		it('sends a signed-in user with a password change pending to the change page', async () => {
			mustChangePassword = true;

			expect(await run(checkUserNotAuthenticatedGuard)).toEqual(redirectTo('/change-password-required'));
		});
	});
});
