import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { SessionStorageService } from '../../../shared/services/session-storage.service';
import { RoomMemberContextService } from '../../room-members/services/room-member-context.service';

/**
 * Guard that clears room-related session data when entering console routes.
 * This ensures roomSecret, e2eeData and room member context are only removed when navigating to console,
 * not when leaving a meeting to go to other non-console pages (like disconnected, room recordings, etc.)
 */
export const clearRoomSessionGuard: CanActivateFn = () => {
	const sessionStorageService = inject(SessionStorageService);
	const roomMemberContextService = inject(RoomMemberContextService);

	// Clear room member context
	roomMemberContextService.clearContext();

	// Clear room-related data from session storage
	sessionStorageService.removeRoomSecret();
	sessionStorageService.removeE2EEData();

	return true;
};
