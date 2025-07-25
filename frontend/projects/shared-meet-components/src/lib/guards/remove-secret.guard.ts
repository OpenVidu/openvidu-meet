import { inject } from '@angular/core';
import { CanActivateFn, NavigationEnd, Router } from '@angular/router';
import { NavigationService, RoomService, SessionStorageService } from '@lib/services';
import { filter, take } from 'rxjs';

/**
 * Guard that intercepts navigation to remove the 'secret' query parameter from the URL
 * when a participant joins a room. The secret is stored in session storage for the current room,
 * and the URL is updated without the 'secret' parameter to enhance security.
 */
export const removeRoomSecretGuard: CanActivateFn = (route, _state) => {
	const router = inject(Router);
	const roomService = inject(RoomService);
	const navigationService = inject(NavigationService);
	const sessionStorageService = inject(SessionStorageService);

	router.events
		.pipe(
			filter((event) => event instanceof NavigationEnd),
			take(1)
		)
		.subscribe(async () => {
			const roomId = roomService.getRoomId();
			const secret = roomService.getRoomSecret();

			// Store the secret in session storage for the current room and remove it from the URL
			sessionStorageService.setRoomSecret(roomId, secret);
			await navigationService.removeQueryParamFromUrl(route.queryParams, 'secret');
		});

	return true;
};
