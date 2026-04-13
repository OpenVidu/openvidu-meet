import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, RouterStateSnapshot } from '@angular/router';
import { NavigationErrorReason } from '../../../shared/models/navigation.model';
import { NavigationService } from '../../../shared/services';
import { RoomAccessService } from '../../rooms/services/room-access.service';
import { RecordingService } from '../services';

/**
 * Guard to validate the access to recordings of a room by generating a room member token and checking permissions.
 */
export const validateRoomRecordingsAccessGuard: CanActivateFn = async (
	_route: ActivatedRouteSnapshot,
	_state: RouterStateSnapshot
) => {
	const roomAccessService = inject(RoomAccessService);
	const navigationService = inject(NavigationService);

	const result = await roomAccessService.validateAccess({
		requireRecordingsPermission: true
	});

	if (result.allowed) {
		return true;
	}

	return navigationService.redirectToErrorPage(result.reason!);
};

/**
 * Guard to validate access to a recording by checking the recording secret and room access permissions.
 * The guard first attempts to validate access by generating a room member token with the required permissions.
 * If that fails and a recording secret is provided, it falls back to validating the recording secret directly.
 * This allows supporting access to recordings for users who may not have permissions to access the room but have a valid recording secret.
 */
export const validateRecordingAccessGuard: CanActivateFn = async (
	route: ActivatedRouteSnapshot,
	state: RouterStateSnapshot
) => {
	const recordingService = inject(RecordingService);
	const navigationService = inject(NavigationService);
	const roomAccessService = inject(RoomAccessService);

	const recordingId = route.params['recording-id'] as string;
	const recordingSecret = route.queryParams['recordingSecret'] as string;

	const roomAccessResult = await roomAccessService.validateAccess({
		requireRecordingsPermission: true,
		skipAuthRecoveryOn401: !!recordingSecret
	});

	if (roomAccessResult.allowed) {
		return true;
	}

	if (!recordingSecret) {
		return navigationService.redirectToErrorPage(roomAccessResult.reason!);
	}

	try {
		// Fallback path: validate recording secret when room-based access fails.
		await recordingService.getRecording(recordingId, recordingSecret);
		return true;
	} catch (error: any) {
		console.error('Error checking recording access:', error);
		switch (error.status) {
			case 400:
				// Invalid secret
				return navigationService.redirectToErrorPage(NavigationErrorReason.INVALID_RECORDING_SECRET);
			case 401:
				// Unauthorized access
				// Redirect to the login page with query param to redirect back to the recording
				return navigationService.redirectToLoginPage(state.url);
			case 403:
				// Anonymous access disabled
				return navigationService.redirectToErrorPage(NavigationErrorReason.ANONYMOUS_RECORDING_ACCESS_DISABLED);
			case 404:
				// Recording not found
				return navigationService.redirectToErrorPage(NavigationErrorReason.INVALID_RECORDING);
			default:
				// Internal error
				return navigationService.redirectToErrorPage(NavigationErrorReason.INTERNAL_ERROR);
		}
	}
};
