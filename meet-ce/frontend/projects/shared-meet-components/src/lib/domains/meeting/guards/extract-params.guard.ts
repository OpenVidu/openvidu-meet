import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn } from '@angular/router';
import { NavigationService } from '../../../shared/services/navigation.service';
import { SessionStorageService } from '../../../shared/services/session-storage.service';
import { extractParams } from '../../../shared/utils/url-params.utils';
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

	// Handle leave redirect URL logic
	navigationService.handleLeaveRedirectUrl(leaveRedirectUrl);

	// Save room ID and secret in the meeting context service
	meetingContextService.setRoomId(roomId);
	if (secret) {
		meetingContextService.setRoomSecret(secret, true);
	}

	// If the showOnlyRecordings flag is set, redirect to the recordings page for the room
	if (showOnlyRecordings === 'true') {
		return navigationService.createRedirectionTo(`/room/${roomId}/recordings`);
	}

	// Handle E2EE key: prioritize query param, fallback to storage
	if (queryE2eeKey) {
		// E2EE key came from URL parameter
		meetingContextService.setE2eeKey(queryE2eeKey, true);
	} else {
		// Try to load E2EE key from storage
		meetingContextService.loadE2eeKeyFromStorage();
	}

	// Handle participant name: prioritize query param, fallback to storage
	if (participantName) {
		// Participant name came from URL parameter
		roomMemberContextService.setParticipantName(participantName, true);
	} else {
		// Try to load participant name from storage
		roomMemberContextService.loadParticipantNameFromStorage();
	}

	return true;
};
