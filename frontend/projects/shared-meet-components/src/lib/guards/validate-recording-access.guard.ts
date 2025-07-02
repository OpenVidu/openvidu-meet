import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, RouterStateSnapshot } from '@angular/router';
import { ErrorReason } from '@lib/models';
import { NavigationService, RecordingManagerService, RoomService } from '@lib/services';

/**
 * Guard to validate the access to recordings.
 */
export const validateRecordingAccessGuard: CanActivateFn = async (
	_route: ActivatedRouteSnapshot,
	_state: RouterStateSnapshot
) => {
	const roomService = inject(RoomService);
	const recordingService = inject(RecordingManagerService);
	const navigationService = inject(NavigationService);

	const roomId = roomService.getRoomId();
	const secret = roomService.getRoomSecret();

	try {
		// Generate a token to access recordings in the room
		await recordingService.generateRecordingToken(roomId, secret);

		if (!recordingService.canRetrieveRecordings()) {
			// If the user does not have permission to retrieve recordings, redirect to the error page
			return navigationService.redirectToErrorPage(ErrorReason.UNAUTHORIZED_RECORDING_ACCESS);
		}

		return true;
	} catch (error: any) {
		console.error('Error generating recording token:', error);
		switch (error.status) {
			case 400:
				// Invalid secret
				return navigationService.redirectToErrorPage(ErrorReason.INVALID_RECORDING_SECRET);
			case 403:
				// Recording access is configured for admins only
				return navigationService.redirectToErrorPage(ErrorReason.RECORDINGS_ADMIN_ONLY_ACCESS);
			case 404:
				// There are no recordings in the room or the room does not exist
				return navigationService.redirectToErrorPage(ErrorReason.NO_RECORDINGS);
			default:
				return navigationService.redirectToErrorPage(ErrorReason.INTERNAL_ERROR);
		}
	}
};
