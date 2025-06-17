import { inject } from '@angular/core';
import { CanActivateFn, NavigationEnd, Router } from '@angular/router';
import { filter, take } from 'rxjs';
import { ContextService, NavigationService, SessionStorageService } from '../services';

/**
 * Guard that intercepts navigation to remove the 'secret' query parameter from the URL
 * when a moderator participant is detected. The secret is stored in session storage
 * for the current room, and the URL is updated without the 'secret' parameter to
 * enhance security.
 */
export const removeModeratorSecretGuard: CanActivateFn = (route, _state) => {
	const contextService = inject(ContextService);
	const navigationService = inject(NavigationService);
	const router = inject(Router);
	const sessionStorageService = inject(SessionStorageService);

	router.events
		.pipe(
			filter((event) => event instanceof NavigationEnd),
			take(1)
		)
		.subscribe(async () => {
			if (contextService.isModeratorParticipant()) {
				const roomId = contextService.getRoomId();
				const storedSecret = sessionStorageService.getModeratorSecret(roomId);
				const moderatorSecret = storedSecret || contextService.getSecret();

				// Store the moderator secret in session storage for the current room and remove it from the URL
				sessionStorageService.setModeratorSecret(roomId, moderatorSecret);
				navigationService.removeModeratorSecretFromUrl({ ...route.queryParams });
			}
		});

	return true;
};
