import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, RouterStateSnapshot } from '@angular/router';
import { NavigationErrorReason } from '../../../shared/models/navigation.model';
import { NavigationService } from '../../../shared/services/navigation.service';
import { RoomMemberContextService } from '../../room-members/services/room-member-context.service';
import { MeetingContextService } from '../services/meeting-context.service';

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
	const roomMemberService = inject(RoomMemberContextService);
	const navigationService = inject(NavigationService);
	const meetingContextService = inject(MeetingContextService);

	const secret = meetingContextService.roomSecret();
	const roomId = meetingContextService.roomId();
	if (!roomId) {
		console.error('Cannot validate room access: room ID is undefined');
		return navigationService.redirectToErrorPage(NavigationErrorReason.INVALID_ROOM);
	}

	try {
		await roomMemberService.generateToken(roomId, {
			secret,
			joinMeeting: false
		});

		// Perform recording validation if requested
		if (validateRecordingPermissions) {
			if (!roomMemberService.hasPermission('canRetrieveRecordings')) {
				// If the user does not have permission to retrieve recordings, redirect to the error page
				return navigationService.redirectToErrorPage(NavigationErrorReason.FORBIDDEN_RECORDING_ACCESS);
			}
		}

		return true;
	} catch (error: any) {
		console.error('Error generating room member token:', error);
		const message = error?.error?.message || error.message || 'Unknown error';
		switch (error.status) {
			case 400:
				// Invalid secret
				return navigationService.redirectToErrorPage(NavigationErrorReason.INVALID_ROOM_SECRET);
			case 401:
				// Unauthorized access
				// Redirect to the login page with query param to redirect back to the page
				return navigationService.redirectToLoginPage(pageUrl);
			case 403:
				// Insufficient permissions or anonymous access disabled
				if (message.includes('Anonymous access')) {
					return navigationService.redirectToErrorPage(NavigationErrorReason.ANONYMOUS_ACCESS_DISABLED);
				}
				return navigationService.redirectToErrorPage(NavigationErrorReason.FORBIDDEN_ROOM_ACCESS);
			case 404:
				// Room or member not found
				if (message.includes('Room member')) {
					return navigationService.redirectToErrorPage(NavigationErrorReason.INVALID_MEMBER);
				}
				return navigationService.redirectToErrorPage(NavigationErrorReason.INVALID_ROOM);
			default:
				return navigationService.redirectToErrorPage(NavigationErrorReason.INTERNAL_ERROR);
		}
	}
};
