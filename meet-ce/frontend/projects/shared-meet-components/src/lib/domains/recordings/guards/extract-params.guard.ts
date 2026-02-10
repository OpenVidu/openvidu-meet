import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn } from '@angular/router';
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
