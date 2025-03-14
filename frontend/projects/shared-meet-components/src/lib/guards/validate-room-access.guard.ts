import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, CanActivateFn } from '@angular/router';
import { ContextService, HttpService, SessionStorageService } from '../services';

/**
 * Guard to validate the access to a room.
 */
export const validateRoomAccessGuard: CanActivateFn = async (
	_route: ActivatedRouteSnapshot,
	_state: RouterStateSnapshot
) => {
	const httpService = inject(HttpService);
	const contextService = inject(ContextService);
	const router = inject(Router);
	const sessionStorageService = inject(SessionStorageService);

	const roomName = contextService.getRoomName();
	const participantName = contextService.getParticipantName();
	const secret = contextService.getSecret();
	const storageSecret = sessionStorageService.getModeratorSecret(roomName);

	try {
		// Generate a participant token
		const response = await httpService.generateParticipantToken({
			roomName,
			participantName,
			secret: storageSecret || secret
		});
		contextService.setToken(response.token);
		return true;
	} catch (error: any) {
		console.error('Error generating participant token:', error);
		switch (error.status) {
			case 409:
				// Participant already exists.
				// Send a timestamp to force update the query params and show the error message in participant name input form
				await router.navigate([`${roomName}/participant-name`], {
					queryParams: { originUrl: _state.url, accessError: 'participant-exists', t: Date.now() },
					skipLocationChange: true
				});
				break;
			case 406:
				await redirectToUnauthorized(router, 'unauthorized-participant');
				break;
			default:
				await redirectToUnauthorized(router, 'invalid-room');
		}
		return false;
	}
};

const redirectToUnauthorized = async (router: Router, reason: string): Promise<boolean> => {
	await router.navigate(['unauthorized'], { queryParams: { reason } });
	return false;
};
