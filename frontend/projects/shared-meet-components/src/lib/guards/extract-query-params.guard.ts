import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn } from '@angular/router';
import { ErrorReason } from '../models';
import { NavigationService, ParticipantTokenService, RoomService, SessionStorageService } from '../services';

export const extractRoomQueryParamsGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
	const navigationService = inject(NavigationService);
	const roomService = inject(RoomService);
	const participantService = inject(ParticipantTokenService);
	const { roomId, participantName, secret, leaveRedirectUrl, showOnlyRecordings } = extractParams(route);

	if (!secret) {
		// If no secret is provided, redirect to the error page
		return navigationService.redirectToErrorPage(ErrorReason.MISSING_ROOM_SECRET);
	}

	roomService.setRoomId(roomId);
	roomService.setRoomSecret(secret);

	if (participantName) {
		participantService.setParticipantName(participantName);
	}

	if (isValidUrl(leaveRedirectUrl)) {
		navigationService.setLeaveRedirectUrl(leaveRedirectUrl);
	}

	if (showOnlyRecordings === 'true') {
		// Redirect to the room recordings page
		return navigationService.createRedirectionTo(`room/${roomId}/recordings`, { secret });
	}

	return true;
};

export const extractRecordingQueryParamsGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
	const navigationService = inject(NavigationService);
	const roomService = inject(RoomService);
	const sessionStorageService = inject(SessionStorageService);

	const { roomId, secret } = extractParams(route);
	const storedSecret = sessionStorageService.getModeratorSecret(roomId);

	if (!secret && !storedSecret) {
		// If no secret is provided, redirect to the error page
		return navigationService.redirectToErrorPage(ErrorReason.MISSING_ROOM_SECRET);
	}

	roomService.setRoomId(roomId);
	roomService.setRoomSecret(secret);

	return true;
};

const extractParams = (route: ActivatedRouteSnapshot) => ({
	roomId: route.params['room-id'],
	participantName: route.queryParams['participant-name'],
	secret: route.queryParams['secret'],
	leaveRedirectUrl: route.queryParams['leave-redirect-url'],
	showOnlyRecordings: route.queryParams['show-only-recordings']
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
