import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router, RouterStateSnapshot } from '@angular/router';
import { ErrorReason } from '../models';
import { AuthMode, ParticipantRole } from '../typings/ce';
import { AuthService, ContextService, HttpService, NavigationService, SessionStorageService } from '../services';

export const checkUserAuthenticatedGuard: CanActivateFn = async (
	_route: ActivatedRouteSnapshot,
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

export const checkUserNotAuthenticatedGuard: CanActivateFn = async (
	_route: ActivatedRouteSnapshot,
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

export const checkParticipantRoleAndAuthGuard: CanActivateFn = async (
	_route: ActivatedRouteSnapshot,
	state: RouterStateSnapshot
) => {
	const navigationService = inject(NavigationService);
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
				return navigationService.createRedirectionToErrorPage(ErrorReason.INVALID_ROOM_SECRET);
			case 404:
				// Room not found
				return navigationService.createRedirectionToErrorPage(ErrorReason.INVALID_ROOM);
			default:
				return navigationService.createRedirectionToErrorPage(ErrorReason.INTERNAL_ERROR);
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
			return navigationService.createRedirectionToLoginPage(state.url);
		}
	}

	// Allow access to the room
	return true;
};

export const checkRecordingAuthGuard: CanActivateFn = async (
	route: ActivatedRouteSnapshot,
	state: RouterStateSnapshot
) => {
	const httpService = inject(HttpService);
	const navigationService = inject(NavigationService);

	const recordingId = route.params['recording-id'];
	const secret = route.queryParams['secret'];

	if (!secret) {
		// If no secret is provided, redirect to the error page
		return navigationService.createRedirectionToErrorPage(ErrorReason.MISSING_RECORDING_SECRET);
	}

	try {
		// Attempt to access the recording to check if the secret is valid
		await httpService.getRecording(recordingId, secret);
		return true;
	} catch (error: any) {
		console.error('Error checking recording access:', error);
		switch (error.status) {
			case 400:
				// Invalid secret
				return navigationService.createRedirectionToErrorPage(ErrorReason.INVALID_RECORDING_SECRET);
			case 401:
				// Unauthorized access
				// Redirect to the login page with query param to redirect back to the recording
				return navigationService.createRedirectionToLoginPage(state.url);
			case 404:
				// Recording not found
				return navigationService.createRedirectionToErrorPage(ErrorReason.INVALID_RECORDING);
			default:
				// Internal error
				return navigationService.createRedirectionToErrorPage(ErrorReason.INTERNAL_ERROR);
		}
	}
};
