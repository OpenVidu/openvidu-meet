import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, RouterStateSnapshot } from '@angular/router';
import { ErrorReason } from '@lib/models';
import {
	AuthService,
	GlobalPreferencesService,
	NavigationService,
	ParticipantTokenService,
	RecordingManagerService,
	RoomService
} from '@lib/services';
import { AuthMode, ParticipantRole } from '@lib/typings/ce';

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

	// Check if user is not authenticated
	const isAuthenticated = await authService.isUserAuthenticated();
	if (isAuthenticated) {
		// Redirect to home page
		return navigationService.createRedirectionTo('');
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
	const preferencesService = inject(GlobalPreferencesService);
	const roomService = inject(RoomService);
	const participantService = inject(ParticipantTokenService);

	// Get the role that the participant will have in the room based on the room ID and secret
	let participantRole: ParticipantRole;

	try {
		const roomId = roomService.getRoomId();
		const secret = roomService.getRoomSecret();

		const roomRoleAndPermissions = await roomService.getRoomRoleAndPermissions(roomId, secret);
		participantRole = roomRoleAndPermissions.role;
		participantService.setParticipantRole(participantRole);
	} catch (error: any) {
		console.error('Error getting participant role:', error);
		switch (error.status) {
			case 400:
				// Invalid secret
				return navigationService.redirectToErrorPage(ErrorReason.INVALID_ROOM_SECRET);
			case 404:
				// Room not found
				return navigationService.redirectToErrorPage(ErrorReason.INVALID_ROOM);
			default:
				return navigationService.redirectToErrorPage(ErrorReason.INTERNAL_ERROR);
		}
	}

	const authMode = await preferencesService.getAuthModeToAccessRoom();

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
			return navigationService.redirectToLoginPage(state.url);
		}
	}

	// Allow access to the room
	return true;
};

export const checkRecordingAuthGuard: CanActivateFn = async (
	route: ActivatedRouteSnapshot,
	state: RouterStateSnapshot
) => {
	const recordingService = inject(RecordingManagerService);
	const navigationService = inject(NavigationService);

	const recordingId = route.params['recording-id'];
	const secret = route.queryParams['secret'];

	if (!secret) {
		// If no secret is provided, redirect to the error page
		return navigationService.redirectToErrorPage(ErrorReason.MISSING_RECORDING_SECRET);
	}

	try {
		// Attempt to access the recording to check if the secret is valid
		await recordingService.getRecording(recordingId, secret);
		return true;
	} catch (error: any) {
		console.error('Error checking recording access:', error);
		switch (error.status) {
			case 400:
				// Invalid secret
				return navigationService.redirectToErrorPage(ErrorReason.INVALID_RECORDING_SECRET);
			case 401:
				// Unauthorized access
				// Redirect to the login page with query param to redirect back to the recording
				return navigationService.redirectToLoginPage(state.url);
			case 404:
				// Recording not found
				return navigationService.redirectToErrorPage(ErrorReason.INVALID_RECORDING);
			default:
				// Internal error
				return navigationService.redirectToErrorPage(ErrorReason.INTERNAL_ERROR);
		}
	}
};
