import { inject } from '@angular/core';
import { CanActivateFn, NavigationEnd, Router } from '@angular/router';
import { NavigationService, ParticipantTokenService, RoomService, SessionStorageService } from '@lib/services';
import { filter, take } from 'rxjs';

/**
 * Guard that intercepts navigation to remove the 'secret' query parameter from the URL
 * when a moderator participant is detected. The secret is stored in session storage
 * for the current room, and the URL is updated without the 'secret' parameter to
 * enhance security.
 */
export const removeModeratorSecretGuard: CanActivateFn = (route, _state) => {
	const roomService = inject(RoomService);
	const participantService = inject(ParticipantTokenService);
	const navigationService = inject(NavigationService);
	const router = inject(Router);
	const sessionStorageService = inject(SessionStorageService);

	router.events
		.pipe(
			filter((event) => event instanceof NavigationEnd),
			take(1)
		)
		.subscribe(async () => {
			if (participantService.isModeratorParticipant()) {
				const roomId = roomService.getRoomId();
				const moderatorSecret = roomService.getRoomSecret();

				// Store the moderator secret in session storage for the current room and remove it from the URL
				sessionStorageService.setModeratorSecret(roomId, moderatorSecret);
				navigationService.removeQueryParamFromUrl(route.queryParams, 'secret');
			}
		});

	return true;
};
