import { inject } from '@angular/core';
import {
	ActivatedRouteSnapshot,
	CanActivateFn,
	RedirectCommand,
	Router,
	RouterStateSnapshot,
	UrlTree
} from '@angular/router';
import { AuthMode, ParticipantRole } from '@lib/typings/ce';
import { AuthService, ContextService, HttpService, SessionStorageService } from '../services';

export const checkUserAuthenticatedGuard: CanActivateFn = async (
	route: ActivatedRouteSnapshot,
	state: RouterStateSnapshot
) => {
	const authService = inject(AuthService);
	const router = inject(Router);

	// Check if user is authenticated
	const isAuthenticated = await authService.isUserAuthenticated();
	if (!isAuthenticated) {
		// Redirect to the login page
		return router.createUrlTree(['login'], {
			queryParams: { redirectTo: state.url }
		});
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
		contextService.setParticipantRole(participantRole);
	} catch (error: any) {
		console.error('Error getting participant role:', error);
		switch (error.status) {
			case 400:
				// Invalid secret
				return redirectToErrorPage(router, 'invalid-secret');
			case 404:
				// Room not found
				return redirectToErrorPage(router, 'invalid-room');
			default:
				return redirectToErrorPage(router, 'internal-error');
		}
	}

	const authMode = await contextService.getAuthModeToAccessRoom();

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
		// Redirect to the console page
		return router.createUrlTree(['console']);
	}

	// Allow access to the requested page
	return true;
};

const redirectToErrorPage = (router: Router, reason: string): UrlTree => {
	return router.createUrlTree(['error'], { queryParams: { reason } });
};
