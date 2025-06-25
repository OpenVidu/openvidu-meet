import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, RouterStateSnapshot } from '@angular/router';
import { ErrorReason } from '../models';
import { ContextService, NavigationService, RecordingManagerService, SessionStorageService } from '../services';

/**
 * Guard to validate the access to recordings.
 */
export const validateRecordingAccessGuard: CanActivateFn = async (
	_route: ActivatedRouteSnapshot,
	_state: RouterStateSnapshot
) => {
	const recordingService = inject(RecordingManagerService);
	const contextService = inject(ContextService);
	const navigationService = inject(NavigationService);
	const sessionStorageService = inject(SessionStorageService);

	const roomId = contextService.getRoomId();
	const secret = contextService.getSecret();
	const storageSecret = sessionStorageService.getModeratorSecret(roomId);

	try {
		// Generate a token to access recordings in the room
		const response = await recordingService.generateRecordingToken(roomId, storageSecret || secret);
		contextService.setRecordingPermissionsFromToken(response.token);

		if (!contextService.canRetrieveRecordings()) {
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
