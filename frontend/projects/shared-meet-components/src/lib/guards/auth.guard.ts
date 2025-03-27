import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router, RouterStateSnapshot } from '@angular/router';
import { AuthService, ContextService } from '../services';
import { AuthMode, ParticipantRole } from '@lib/typings/ce';

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

export const checkParticipantRoleAndAuthGuard: CanActivateFn = async (
	_route: ActivatedRouteSnapshot,
	state: RouterStateSnapshot
) => {
	const authService = inject(AuthService);
	const contextService = inject(ContextService);
	const router = inject(Router);

	const participantRole = contextService.getParticipantRole();
	const authMode = await contextService.getAuthModeToEnterRoom();

	// If the user is a moderator and the room requires authentication for moderators only,
	// or if the room requires authentication for all users,
	// then check if the user is authenticated
	const isAuthRequiredForModerators =
		authMode === AuthMode.MODERATORS_ONLY && participantRole === ParticipantRole.MODERATOR;
	const isAuthRequiredForAllUsers = authMode === AuthMode.ALL_USERS;
	console.log('Participant role:', participantRole);

	if (isAuthRequiredForModerators || isAuthRequiredForAllUsers) {
		// Check if user is authenticated
		const isAuthenticated = await authService.isUserAuthenticated();
		if (!isAuthenticated) {
			// Redirect to the login page with query param to redirect back to the room
			return router.createUrlTree(['login'], {
				queryParams: { redirectTo: state.url }
			});
		}
	}

	// Allow access to the room
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
