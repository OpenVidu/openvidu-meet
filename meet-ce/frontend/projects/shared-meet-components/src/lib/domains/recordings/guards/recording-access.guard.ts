import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { NavigationService } from '../../../shared/services/navigation.service';
import { RecordingService } from '../services/recording.service';

/**
 * Guard that checks the authenticated user can access a recording.
 * Attempts to retrieve the recording; if the request fails (e.g. 403/404), redirects to /recordings.
 */
export const checkRecordingAccessGuard: CanActivateFn = async (route) => {
	const recordingService = inject(RecordingService);
	const navigationService = inject(NavigationService);

	const recordingId = route.paramMap.get('recording-id');
	if (!recordingId) {
		return navigationService.createRedirectionTo('/recordings');
	}

	try {
		await recordingService.getRecording(recordingId);
		return true;
	} catch {
		return navigationService.createRedirectionTo('/recordings');
	}
};
