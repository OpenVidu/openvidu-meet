import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, RouterStateSnapshot } from '@angular/router';
import { ErrorReason } from '../models';
import { NavigationService, RecordingService, RoomMemberService, RoomService } from '../services';

/**
 * Guard to validate access to a room by generating a room member token.
 */
export const validateRoomAccessGuard: CanActivateFn = async (
	_route: ActivatedRouteSnapshot,
	state: RouterStateSnapshot
) => {
	return validateRoomAccessInternal(state.url);
};

/**
 * Guard to validate the access to recordings of a room by generating a room member token and checking permissions.
 */
export const validateRoomRecordingsAccessGuard: CanActivateFn = async (
	_route: ActivatedRouteSnapshot,
	state: RouterStateSnapshot
) => {
	return validateRoomAccessInternal(state.url, true);
};

/**
 * Internal helper function to validate room access by generating a room member token.
 *
 * @param pageUrl - The URL of the page being accessed
 * @param validateRecordingPermissions - Whether to validate recording access permissions
 * @returns True if access is granted, or UrlTree for redirection
 */
const validateRoomAccessInternal = async (pageUrl: string, validateRecordingPermissions = false) => {
	const roomService = inject(RoomService);
	const roomMemberService = inject(RoomMemberService);
	const navigationService = inject(NavigationService);

	const roomId = roomService.getRoomId();
	const secret = roomService.getRoomSecret();

	try {
		await roomMemberService.generateToken(roomId, {
			secret,
			grantJoinMeetingPermission: false
		});

		// Perform recording validation if requested
		if (validateRecordingPermissions) {
			if (!roomMemberService.canRetrieveRecordings()) {
				// If the user does not have permission to retrieve recordings, redirect to the error page
				return navigationService.redirectToErrorPage(ErrorReason.UNAUTHORIZED_RECORDING_ACCESS);
			}
		}

		return true;
	} catch (error: any) {
		console.error('Error generating room member token:', error);
		switch (error.status) {
			case 400:
				// Invalid secret
				return navigationService.redirectToErrorPage(ErrorReason.INVALID_ROOM_SECRET);
			case 401:
				// Unauthorized access
				// Redirect to the login page with query param to redirect back to the page
				return navigationService.redirectToLoginPage(pageUrl);
			case 404:
				// Room not found
				return navigationService.redirectToErrorPage(ErrorReason.INVALID_ROOM);
			default:
				return navigationService.redirectToErrorPage(ErrorReason.INTERNAL_ERROR);
		}
	}
};

/**
 * Guard to validate access to a recording by checking the recording secret.
 */
export const validateRecordingAccessGuard: CanActivateFn = async (
	route: ActivatedRouteSnapshot,
	state: RouterStateSnapshot
) => {
	const recordingService = inject(RecordingService);
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
