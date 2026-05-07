import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn } from '@angular/router';
import { NavigationErrorReason } from '../../../shared/models/navigation.model';
import { NavigationService } from '../../../shared/services/navigation.service';
import { SessionStorageService } from '../../../shared/services/session-storage.service';
import { extractParams } from '../../../shared/utils/url-params.utils';
import { MeetingContextService } from '../../meeting/services/meeting-context.service';

export const extractRoomRecordingsParamsGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
	const meetingContextService = inject(MeetingContextService);
	const sessionStorageService = inject(SessionStorageService);

	const { roomId, secret: querySecret } = extractParams(route);
	const secret = querySecret || sessionStorageService.getRoomSecret();

	// Save parameters in the meeting context service
	meetingContextService.setRoomId(roomId);
	if (secret) {
		meetingContextService.setRoomSecret(secret, true);
	}

	return true;
};

export const extractRecordingParamsGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
	const meetingContextService = inject(MeetingContextService);
	const sessionStorageService = inject(SessionStorageService);
	const navigationService = inject(NavigationService);

	const recordingId = route.params['recording-id'] as string;
	const [roomId] = recordingId.split('--');

	// Invalid recording ID format
	if (!roomId) {
		console.error('Cannot validate recording access: invalid recording ID format');
		return navigationService.redirectToErrorPage(NavigationErrorReason.INVALID_RECORDING);
	}

	const { secret: querySecret } = extractParams(route);
	const secret = querySecret || sessionStorageService.getRoomSecret();

	// Save parameters in the meeting context service
	meetingContextService.setRoomId(roomId);
	if (secret) {
		meetingContextService.setRoomSecret(secret, true);
	}

	return true;
};
