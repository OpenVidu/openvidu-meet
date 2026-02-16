import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { SessionStorageService } from '../../../shared/services/session-storage.service';
import { MeetingContextService } from '../../meeting/services/meeting-context.service';
import { RoomMemberContextService } from '../../room-members/services/room-member-context.service';

/**
 * Guard that clears room-related session data when entering console routes.
 * This ensures session storage data, and room member and meeting context are only removed when navigating to console,
 * not when leaving a meeting to go to other non-console pages (like disconnected, room recordings, etc.)
 */
export const clearRoomSessionGuard: CanActivateFn = () => {
	const sessionStorageService = inject(SessionStorageService);
	const roomMemberContextService = inject(RoomMemberContextService);
	const meetingContextService = inject(MeetingContextService);

	// Clear room member and meeting context
	roomMemberContextService.clearContext();
	meetingContextService.clearContext();

	// Clear room-related data from session storage
	sessionStorageService.removeRoomSecret();
	sessionStorageService.removeE2EEData();
	sessionStorageService.removeRedirectUrl();

	return true;
};
