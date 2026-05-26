import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn } from '@angular/router';
import { NavigationService } from '../../../shared/services/navigation.service';
import { SessionStorageService } from '../../../shared/services/session-storage.service';
import { extractParams } from '../../../shared/utils/url-params.utils';
import { MeetingContextService } from '../../meeting/services/meeting-context.service';
import { RecordingEntryService } from '../services/recording-entry.service';

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

/**
 * Adapter guard: extracts recording params from the route + session storage
 * fallback and delegates the actual context-seeding to
 * {@link RecordingEntryService.prepare}.
 */
export const extractRecordingParamsGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
	const recordingEntry = inject(RecordingEntryService);
	const navigationService = inject(NavigationService);
	const sessionStorageService = inject(SessionStorageService);

	const recordingId = route.params['recording-id'] as string;
	const { secret: querySecret } = extractParams(route);
	const roomSecret = querySecret || sessionStorageService.getRoomSecret() || undefined;

	const decision = recordingEntry.prepare({ recordingId, roomSecret });
	if (decision.kind === 'error') {
		return navigationService.redirectToErrorPage(decision.reason);
	}

	return true;
};
