import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router, RouterStateSnapshot } from '@angular/router';
import { AuthService, ContextService } from '../services';

export const checkUserAuthenticatedGuard: CanActivateFn = async (
	route: ActivatedRouteSnapshot,
	_state: RouterStateSnapshot
) => {
	const authService = inject(AuthService);
	const router = inject(Router);

	// Check if the route allows skipping authentication
	const { checkSkipAuth } = route.data;
	if (checkSkipAuth) {
		const contextService = inject(ContextService);
		const isAuthRequired = await contextService.isAuthRequiredToCreateRooms();

		if (!isAuthRequired) {
			return true;
		}
	}

	// Check if user is authenticated
	const isAuthenticated = await authService.isUserAuthenticated();
	if (!isAuthenticated) {
		// Redirect to the login page specified in the route data when user is not authenticated
		const { redirectToUnauthorized } = route.data;
		return router.createUrlTree([redirectToUnauthorized]);
	}

	// Check if the user has the expected roles
	const { expectedRoles } = route.data;
	const userRole = await authService.getUserRole();

	if (!expectedRoles.includes(userRole)) {
		// Redirect to the page specified in the route data when user has an invalid role
		const { redirectToInvalidRole } = route.data;
		return router.createUrlTree([redirectToInvalidRole]);
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
		return router.createUrlTree([redirectTo]);
	}

	// Allow access to the requested page
	return true;
};
