import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn } from '@angular/router';
import { NavigationService } from '../../../shared/services/navigation.service';
import { SessionStorageService } from '../../../shared/services/session-storage.service';
import { extractParams, handleLeaveRedirectUrl } from '../../../shared/utils/url-params.utils';
import { RoomMemberContextService } from '../../room-members/services/room-member-context.service';
import { MeetingContextService } from '../services/meeting-context.service';

export const extractRoomParamsGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
	const navigationService = inject(NavigationService);
	const meetingContextService = inject(MeetingContextService);
	const roomMemberContextService = inject(RoomMemberContextService);
	const sessionStorageService = inject(SessionStorageService);

	const {
		roomId,
		secret: querySecret,
		participantName,
		leaveRedirectUrl,
		showOnlyRecordings,
		e2eeKey: queryE2eeKey
	} = extractParams(route);
	const secret = querySecret || sessionStorageService.getRoomSecret();
	const e2eeKey = queryE2eeKey || sessionStorageService.getE2EEKey();

	// Handle leave redirect URL logic
	navigationService.handleLeaveRedirectUrl(leaveRedirectUrl);

	// Save parameters in the meeting context and room member context services
	meetingContextService.setRoomId(roomId);
	if (secret) {
		meetingContextService.setRoomSecret(secret, true);
	}
	if (e2eeKey) {
		meetingContextService.setE2eeKey(e2eeKey);
	}
	if (participantName) {
		roomMemberContextService.setParticipantName(participantName);
	}

	// If the showOnlyRecordings flag is set, redirect to the recordings page for the room
	if (showOnlyRecordings === 'true') {
		return navigationService.createRedirectionTo(`room/${roomId}/recordings`, { secret });
	}

	return true;
};
