import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router } from '@angular/router';
import { ContextService } from '../services';

export const extractRoomQueryParamsGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
	const router = inject(Router);
	const contextService = inject(ContextService);
	const { roomId, participantName, secret, leaveRedirectUrl, viewRecordings } = extractParams(route);

	if (isValidUrl(leaveRedirectUrl)) {
		contextService.setLeaveRedirectUrl(leaveRedirectUrl);
	}

	contextService.setRoomId(roomId);
	contextService.setParticipantName(participantName);
	contextService.setSecret(secret);

	if (viewRecordings === 'true') {
		// Redirect to the room recordings page
		return router.createUrlTree([`room/${roomId}/recordings`], {
			queryParams: { secret }
		});
	}

	return true;
};

export const extractRecordingQueryParamsGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
	const contextService = inject(ContextService);
	const { roomId, secret } = extractParams(route);

	contextService.setRoomId(roomId);
	contextService.setSecret(secret);

	return true;
};

const extractParams = (route: ActivatedRouteSnapshot) => ({
	roomId: route.params['room-id'],
	participantName: route.queryParams['participant-name'],
	secret: route.queryParams['secret'],
	leaveRedirectUrl: route.queryParams['leave-redirect-url'],
	viewRecordings: route.queryParams['view-recordings']
});

const isValidUrl = (url: string) => {
	if (!url) return false;

	try {
		new URL(url);
		return true;
	} catch (error) {
		return false;
	}
};
