import { inject } from '@angular/core';
import { Location } from '@angular/common';
import { CanActivateFn, NavigationEnd } from '@angular/router';
import { Router } from '@angular/router';
import { ContextService, HttpService, SessionStorageService } from '../services';
import { filter, take } from 'rxjs';

/**
 * Guard that replaces the moderator secret in the URL with the publisher secret.
 *
 * This guard checks if the current participant is a moderator. If so, it retrieves the moderator and publisher secrets
 * for the current room and updates the session storage with the moderator secret. It then replaces the secret in the URL
 * with the publisher secret.
 *
 * @param route - The activated route snapshot.
 * @param state - The router state snapshot.
 * @returns A promise that resolves to `true` if the operation is successful, otherwise `false`.
 *
 * @throws Will log an error and return `false` if an error occurs during the process.
 */
export const replaceModeratorSecretGuard: CanActivateFn = (route, _state) => {
	const httpService = inject(HttpService);
	const contextService = inject(ContextService);
	const router = inject(Router);
	const location: Location = inject(Location);
	const sessionStorageService = inject(SessionStorageService);

	try {
		router.events
			.pipe(
				filter((event) => event instanceof NavigationEnd),
				take(1)
			)
			.subscribe(async () => {
				if (contextService.isModeratorParticipant()) {
					const roomName = contextService.getRoomName();
					const { moderatorSecret, publisherSecret } = await getUrlSecret(httpService, roomName);

					sessionStorageService.setModeratorSecret(roomName, moderatorSecret);
					// Replace secret in URL by the publisher secret
					const queryParams = { ...route.queryParams, secret: publisherSecret };
					const urlTree = router.createUrlTree([], { queryParams, queryParamsHandling: 'merge' });
					const newUrl = router.serializeUrl(urlTree);

					location.replaceState(newUrl);
				}
			});

		return true;
	} catch (error) {
		console.error('error', error);
		return false;
	}
};

const getUrlSecret = async (
	httpService: HttpService,
	roomName: string
): Promise<{ moderatorSecret: string; publisherSecret: string }> => {
	const { moderatorRoomUrl, publisherRoomUrl } = await httpService.getRoom(
		roomName,
		'moderatorRoomUrl,publisherRoomUrl'
	);

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
