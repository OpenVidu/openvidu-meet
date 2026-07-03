import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn } from '@angular/router';
import { NavigationService } from '../../../shared/services/navigation.service';
import { extractParams } from '../../../shared/utils/url.utils';
import { RecordingEntryService } from '../services/recording-entry.service';
import { RoomRecordingsEntryService } from '../services/room-recordings-entry.service';

/**
 * Adapter guard: extracts room recordings params from the route and delegates
 * context-seeding to {@link RoomRecordingsEntryService.prepare}
 */
export const extractRoomRecordingsParamsGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
	const roomRecordingsEntry = inject(RoomRecordingsEntryService);

	const { roomId, secret } = extractParams(route);

	roomRecordingsEntry.prepare({ roomId, secret });
	return true;
};

/**
 * Adapter guard: extracts recording params from the route and delegates the
 * actual context-seeding to {@link RecordingEntryService.prepare}
 */
export const extractRecordingParamsGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
	const recordingEntry = inject(RecordingEntryService);
	const navigationService = inject(NavigationService);

	const recordingId = route.params['recording-id'] as string;
	const { secret: roomSecret } = extractParams(route);

	const decision = recordingEntry.prepare({ recordingId, roomSecret });
	if (decision.kind === 'error') {
		return navigationService.redirectToErrorPage(decision.reason);
	}

	return true;
};
