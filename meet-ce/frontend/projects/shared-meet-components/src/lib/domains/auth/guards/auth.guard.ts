import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, RouterStateSnapshot } from '@angular/router';
import { MeetUserRole } from '@openvidu-meet/typings';
import { NavigationService, SessionStorageService } from '../../../shared/services';
import { AuthService } from '../services';

export const checkUserAuthenticatedGuard: CanActivateFn = async (
	_route: ActivatedRouteSnapshot,
	state: RouterStateSnapshot
) => {
	const authService = inject(AuthService);
	const navigationService = inject(NavigationService);

	// Check if user is authenticated
	const isAuthenticated = await authService.isUserAuthenticated();
	if (!isAuthenticated) {
		// Redirect to the login page
		return navigationService.redirectToLoginPage(state.url);
	}

	// Allow access to the requested page
	return true;
};

export const checkUserNotAuthenticatedGuard: CanActivateFn = async (
	_route: ActivatedRouteSnapshot,
	_state: RouterStateSnapshot
) => {
	const authService = inject(AuthService);
	const navigationService = inject(NavigationService);
	const sessionStorageService = inject(SessionStorageService);

	// Check if user is not authenticated
	const isAuthenticated = await authService.isUserAuthenticated();
	if (isAuthenticated) {
		// If user is authenticated but must change password, redirect to mandatory password change page
		if (sessionStorageService.getMustChangePasswordRequired()) {
			return navigationService.createRedirectionTo('/change-password-required');
		}

		// Redirect to home page
		return navigationService.createRedirectionTo('/');
	}

	// Allow access to the requested page
	return true;
};

export const checkPasswordChangeNotRequiredGuard: CanActivateFn = async (
	_route: ActivatedRouteSnapshot,
	_state: RouterStateSnapshot
) => {
	const navigationService = inject(NavigationService);
	const sessionStorageService = inject(SessionStorageService);

	// If user must change password, redirect to mandatory password change page
	if (sessionStorageService.getMustChangePasswordRequired()) {
		return navigationService.createRedirectionTo('/change-password-required');
	}

	// Allow access to the requested page
	return true;
};

export const checkPasswordChangeRequiredGuard: CanActivateFn = async (
	_route: ActivatedRouteSnapshot,
	_state: RouterStateSnapshot
) => {
	const navigationService = inject(NavigationService);
	const sessionStorageService = inject(SessionStorageService);

	// If user is authenticated but must not change password, redirect to home page
	if (!sessionStorageService.getMustChangePasswordRequired()) {
		return navigationService.createRedirectionTo('/');
	}

	// Allow access to the requested page
	return true;
};

export const checkRoleGuard =
	(allowedRoles: MeetUserRole[]): CanActivateFn =>
	async (_route: ActivatedRouteSnapshot, _state: RouterStateSnapshot) => {
		const authService = inject(AuthService);
		const navigationService = inject(NavigationService);

		// If user doesn't have required role, redirect to rooms page
		const role = await authService.getUserRole();
		if (!role || !allowedRoles.includes(role)) {
			return navigationService.createRedirectionTo('/rooms');
		}

		return true;
	};
