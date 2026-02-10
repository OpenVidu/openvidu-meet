import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, RouterStateSnapshot } from '@angular/router';
import { NavigationErrorReason } from '../../../shared/models/navigation.model';
import { NavigationService } from '../../../shared/services';
import { RecordingService } from '../services';

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

	try {
		// Attempt to access the recording to check if the secret is valid
		await recordingService.getRecording(recordingId, secret);
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
			case 404:
				// Recording not found
				return navigationService.redirectToErrorPage(NavigationErrorReason.INVALID_RECORDING);
			default:
				// Internal error
				return navigationService.redirectToErrorPage(NavigationErrorReason.INTERNAL_ERROR);
		}
	}
};
