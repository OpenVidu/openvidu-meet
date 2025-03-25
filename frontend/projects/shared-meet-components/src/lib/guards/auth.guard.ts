import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router, RouterStateSnapshot } from '@angular/router';
import { AuthService } from '../services';
import { UserRole } from '@lib/typings/ce';

export const checkUserAuthenticatedGuard: CanActivateFn = async (
	route: ActivatedRouteSnapshot,
	_state: RouterStateSnapshot
) => {
	const authService = inject(AuthService);
	const router = inject(Router);

	// Check if admin is authenticated
	const isAuthenticated = await authService.isUserAuthenticated();
	if (!isAuthenticated) {
		// Redirect to the login page specified in the route data when user is not authenticated
		const { redirectToUnauthorized } = route.data;
		router.navigate([redirectToUnauthorized]);
		return false;
	}

	// Check if the user has the expected roles
	const { expectedRoles } = route.data;
	const userRole = authService.isAdmin() ? UserRole.ADMIN : UserRole.USER;

	if (!expectedRoles.includes(userRole)) {
		// Redirect to the page specified in the route data when user has an invalid role
		const { redirectToInvalidRole } = route.data;
		router.navigate([redirectToInvalidRole]);
		return false;
	}

	// Allow access to the requested page
	return true;
};

export const checkUserNotAuthenticatedGuard: CanActivateFn = async (
	route: ActivatedRouteSnapshot,
	_state: RouterStateSnapshot
) => {
	const authService = inject(AuthService);
	const router = inject(Router);

	// Check if user is not authenticated
	const isAuthenticated = await authService.isUserAuthenticated();
	if (isAuthenticated) {
		// Redirect to the page specified in the route data
		const { redirectTo } = route.data;
		router.navigate([redirectTo]);
		return false;
	}

	// Allow access to the requested page
	return true;
};
