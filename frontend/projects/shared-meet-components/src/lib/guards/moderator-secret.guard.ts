import { inject } from '@angular/core';
import { Location } from '@angular/common';
import { CanActivateFn, NavigationEnd } from '@angular/router';
import { Router } from '@angular/router';
import { ContextService, HttpService, SessionStorageService } from '../services';
import { filter, take } from 'rxjs';

/**
 * Guard that intercepts navigation to remove the 'secret' query parameter from the URL
 * when a moderator participant is detected. The secret is stored in session storage
 * for the current room, and the URL is updated without the 'secret' parameter to
 * enhance security.
 */
export const removeModeratorSecretGuard: CanActivateFn = (route, _state) => {
	const httpService = inject(HttpService);
	const contextService = inject(ContextService);
	const router = inject(Router);
	const location: Location = inject(Location);
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
				sessionStorageService.setModeratorSecret(roomId, moderatorSecret);

				// Remove secret from URL
				const queryParams = { ...route.queryParams };
				delete queryParams['secret'];
				const urlTree = router.createUrlTree([], { queryParams });
				const newUrl = router.serializeUrl(urlTree);

				location.replaceState(newUrl);
			}
		});

	return true;
};

const getUrlSecret = async (
	httpService: HttpService,
	roomId: string
): Promise<{ moderatorSecret: string; publisherSecret: string }> => {
	const { moderatorRoomUrl, publisherRoomUrl } = await httpService.getRoom(roomId);

	const extractSecret = (urlString: string, type: string): string => {
		const url = new URL(urlString);
		const secret = url.searchParams.get('secret');
		if (!secret) throw new Error(`${type} secret not found`);
		return secret;
	};

	const publisherSecret = extractSecret(publisherRoomUrl, 'Publisher');
	const moderatorSecret = extractSecret(moderatorRoomUrl, 'Moderator');

	return { publisherSecret, moderatorSecret };
};
