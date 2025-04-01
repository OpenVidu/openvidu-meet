import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, CanActivateFn, UrlTree, RedirectCommand } from '@angular/router';
import { ContextService, HttpService, SessionStorageService } from '../services';

/**
 * Guard to validate the access to a room.
 */
export const validateRoomAccessGuard: CanActivateFn = async (
	_route: ActivatedRouteSnapshot,
	state: RouterStateSnapshot
) => {
	const httpService = inject(HttpService);
	const contextService = inject(ContextService);
	const router = inject(Router);
	const sessionStorageService = inject(SessionStorageService);

	const roomId = contextService.getRoomId();
	const participantName = contextService.getParticipantName();
	const secret = contextService.getSecret();
	const storageSecret = sessionStorageService.getModeratorSecret(roomId);

	try {
		// Generate a participant token
		const response = await httpService.generateParticipantToken({
			roomId,
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
				const participantNameRoute = router.createUrlTree([`room/${roomId}/participant-name`], {
					queryParams: { originUrl: state.url, accessError: 'participant-exists', t: Date.now() }
				});
				return new RedirectCommand(participantNameRoute, {
					skipLocationChange: true
				});
			case 406:
				return redirectToUnauthorized(router, 'unauthorized-participant');
			default:
				return redirectToUnauthorized(router, 'invalid-room');
		}
	}
};

const redirectToUnauthorized = (router: Router, reason: string): UrlTree => {
	return router.createUrlTree(['unauthorized'], { queryParams: { reason } });
};
