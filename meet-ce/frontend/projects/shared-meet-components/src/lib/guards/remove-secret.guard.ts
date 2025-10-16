import { inject } from '@angular/core';
import { CanActivateFn, NavigationEnd, Router } from '@angular/router';
import { NavigationService } from '@openvidu-meet/shared/services';
import { filter, take } from 'rxjs';

/**
 * Guard that intercepts navigation to remove the 'secret' query parameter from the URL
 * that determine the role of a participant when joining a room or accessing its recordings,
 * in order to enhance security.
 */
export const removeRoomSecretGuard: CanActivateFn = (route, _state) => {
	const router = inject(Router);
	const navigationService = inject(NavigationService);

	router.events
		.pipe(
			filter((event) => event instanceof NavigationEnd),
			take(1)
		)
		.subscribe(async () => {
			await navigationService.removeQueryParamFromUrl(route.queryParams, 'secret');
		});

	return true;
};
