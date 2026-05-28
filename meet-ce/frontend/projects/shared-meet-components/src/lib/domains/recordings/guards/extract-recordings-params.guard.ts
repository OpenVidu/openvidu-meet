import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn } from '@angular/router';
import { NavigationService } from '../../../shared/services/navigation.service';
import { SessionStorageService } from '../../../shared/services/session-storage.service';
import { extractParams } from '../../../shared/utils/url-params.utils';
import { RecordingEntryService } from '../services/recording-entry.service';
import { RoomRecordingsEntryService } from '../services/room-recordings-entry.service';

/**
 * Adapter guard: extracts room recordings params from the route + session
 * storage fallback and delegates context-seeding to
 * {@link RoomRecordingsEntryService.prepare}.
 */
export const extractRoomRecordingsParamsGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
	const roomRecordingsEntry = inject(RoomRecordingsEntryService);
	const sessionStorageService = inject(SessionStorageService);

	const { roomId, secret: querySecret } = extractParams(route);
	const secret = querySecret || sessionStorageService.getRoomSecret() || undefined;

	roomRecordingsEntry.prepare({ roomId, secret });
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
