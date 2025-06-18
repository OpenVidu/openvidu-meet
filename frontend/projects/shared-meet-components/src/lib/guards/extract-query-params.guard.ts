import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn } from '@angular/router';
import { ContextService, NavigationService } from '../services';
import { ErrorReason } from '../models';

export const extractRoomQueryParamsGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
	const navigationService = inject(NavigationService);
	const contextService = inject(ContextService);
	const { roomId, participantName, secret, leaveRedirectUrl, viewRecordings } = extractParams(route);

	if (isValidUrl(leaveRedirectUrl)) {
		contextService.setLeaveRedirectUrl(leaveRedirectUrl);
	}

	if (!secret) {
		// If no secret is provided, redirect to the error page
		return navigationService.createRedirectionToErrorPage(ErrorReason.MISSING_ROOM_SECRET);
	}

	contextService.setRoomId(roomId);
	contextService.setParticipantName(participantName);
	contextService.setSecret(secret);

	if (viewRecordings === 'true') {
		// Redirect to the room recordings page
		return navigationService.createRedirectionToRecordingsPage(roomId, secret);
	}

	return true;
};

export const extractRecordingQueryParamsGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
	const navigationService = inject(NavigationService);
	const contextService = inject(ContextService);
	const sessionStorageService = inject(SessionStorageService);

	const { roomId, secret } = extractParams(route);
	const storedSecret = sessionStorageService.getModeratorSecret(roomId);

	if (!secret && !storedSecret) {
		// If no secret is provided, redirect to the error page
		return navigationService.createRedirectionToErrorPage(ErrorReason.MISSING_ROOM_SECRET);
	}

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
