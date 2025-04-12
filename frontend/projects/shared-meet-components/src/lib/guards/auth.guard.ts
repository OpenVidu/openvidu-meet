import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, RedirectCommand, Router, RouterStateSnapshot } from '@angular/router';
import { AuthService, ContextService, HttpService, SessionStorageService } from '../services';
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
	const router = inject(Router);
	const authService = inject(AuthService);
	const contextService = inject(ContextService);
	const sessionStorageService = inject(SessionStorageService);
	const httpService = inject(HttpService);

	// Get the role that the participant will have in the room based on the room ID and secret
	let participantRole: ParticipantRole;

	try {
		const roomId = contextService.getRoomId();
		const secret = contextService.getSecret();
		const storageSecret = sessionStorageService.getModeratorSecret(roomId);

		const roomRoleAndPermissions = await httpService.getRoomRoleAndPermissions(roomId, storageSecret || secret);
		participantRole = roomRoleAndPermissions.role;
	} catch (error) {
		console.error('Error getting participant role:', error);
		return router.createUrlTree(['unauthorized'], { queryParams: { reason: 'unauthorized-participant' } });
	}

	const authMode = await contextService.getAuthModeToEnterRoom();

	// If the user is a moderator and the room requires authentication for moderators only,
	// or if the room requires authentication for all users,
	// then check if the user is authenticated
	const isAuthRequiredForModerators =
		authMode === AuthMode.MODERATORS_ONLY && participantRole === ParticipantRole.MODERATOR;
	const isAuthRequiredForAllUsers = authMode === AuthMode.ALL_USERS;

	if (isAuthRequiredForModerators || isAuthRequiredForAllUsers) {
		// Check if user is authenticated
		const isAuthenticated = await authService.isUserAuthenticated();
		if (!isAuthenticated) {
			// Redirect to the login page with query param to redirect back to the room
			const loginRoute = router.createUrlTree(['login'], {
				queryParams: { redirectTo: state.url }
			});
			return new RedirectCommand(loginRoute, {
				skipLocationChange: true
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
