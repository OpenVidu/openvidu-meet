import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn } from '@angular/router';
import { NavigationService } from '../../../shared/services/navigation.service';
import { SessionStorageService } from '../../../shared/services/session-storage.service';
import { extractParams } from '../../../shared/utils/url-params.utils';
import { RoomMemberContextService } from '../../room-members/services/room-member-context.service';
import { MeetingContextService } from '../services/meeting-context.service';
import { MeetingEntryService } from '../services/meeting-entry.service';

/**
 * Adapter guard: extracts meeting params from the route + session/local storage
 * fallbacks (which are routing-environment-specific) and delegates the actual
 * context-seeding to {@link MeetingEntryService.prepare}. That same use case
 * is reused by non-router callers (the Angular Elements Web Component).
 */
export const extractRoomMeetingParamsGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
	const meetingEntry = inject(MeetingEntryService);
	const navigation = inject(NavigationService);
	const sessionStorage = inject(SessionStorageService);
	const meetingContext = inject(MeetingContextService);
	const roomMemberContext = inject(RoomMemberContextService);

	const {
		roomId,
		secret: querySecret,
		participantName,
		leaveRedirectUrl,
		showOnlyRecordings,
		showRecording,
		e2eeKey: queryE2eeKey
	} = extractParams(route);
	const secret = querySecret || sessionStorage.getRoomSecret() || undefined;

	const decision = meetingEntry.prepare({
		roomId,
		secret,
		leaveRedirectUrl,
		e2eeKey: queryE2eeKey || undefined,
		e2eeKeyFromUrl: queryE2eeKey ? true : undefined,
		participantName: participantName || undefined,
		participantNameFromUrl: participantName ? true : undefined,
		showRecording,
		showOnlyRecordings: showOnlyRecordings === 'true'
	});

	if (decision.kind === 'redirect') {
		return navigation.createRedirectionTo(decision.to);
	}

	// Storage fallbacks live in the route adapter (not the use case): when the
	// route did not carry an E2EE key or participant name, try restoring them
	// from per-tab/per-origin storage. Web Component callers handle this
	// themselves (or skip it) since they don't share the SPA's storage scope.
	if (!queryE2eeKey) {
		meetingContext.loadE2eeKeyFromStorage();
	}
	if (!participantName) {
		roomMemberContext.loadParticipantNameFromStorage();
	}

	return true;
};
