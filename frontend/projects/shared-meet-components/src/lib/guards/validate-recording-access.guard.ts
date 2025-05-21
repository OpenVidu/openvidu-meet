import { inject } from '@angular/core';
import {
	ActivatedRouteSnapshot,
	Router,
	RouterStateSnapshot,
	CanActivateFn,
	UrlTree,
	RedirectCommand
} from '@angular/router';
import { ContextService, HttpService, SessionStorageService } from '../services';

/**
 * Guard to validate the access to recordings.
 */
export const validateRecordingAccessGuard: CanActivateFn = async (
	_route: ActivatedRouteSnapshot,
	_state: RouterStateSnapshot
) => {
	const httpService = inject(HttpService);
	const contextService = inject(ContextService);
	const router = inject(Router);
	const sessionStorageService = inject(SessionStorageService);

	const roomId = contextService.getRoomId();
	const secret = contextService.getSecret();
	const storageSecret = sessionStorageService.getModeratorSecret(roomId);

	try {
		// Generate a token to access recordings in the room
		const response = await httpService.generateRecordingToken(roomId, storageSecret || secret);
		contextService.setRecordingPermissionsFromToken(response.token);

		if (!contextService.canRetrieveRecordings()) {
			// If the user does not have permission to retrieve recordings, redirect to the unauthorized page
			return redirectToUnauthorized(router, 'unauthorized-recording-access');
		}

		return true;
	} catch (error: any) {
		console.error('Error generating recording token:', error);
		switch (error.status) {
			case 403:
				// Recording access is configured for admins only
				return redirectToUnauthorized(router, 'unauthorized-recording-access');
			case 404:
				// There are no recordings in the room or the room does not exist
				return redirectToUnauthorized(router, 'no-recordings');
			default:
				return redirectToUnauthorized(router, 'invalid-room');
		}
	}
};

const redirectToUnauthorized = (router: Router, reason: string): UrlTree => {
	return router.createUrlTree(['unauthorized'], { queryParams: { reason } });
};
