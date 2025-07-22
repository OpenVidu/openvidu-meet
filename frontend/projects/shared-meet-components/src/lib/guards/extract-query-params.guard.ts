import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn } from '@angular/router';
import { ErrorReason } from '@lib/models';
import { NavigationService, ParticipantTokenService, RoomService, SessionStorageService } from '@lib/services';
import { WebComponentProperty } from '@lib/typings/ce/webcomponent/properties.model';

export const extractRoomQueryParamsGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
	const navigationService = inject(NavigationService);
	const roomService = inject(RoomService);
	const participantService = inject(ParticipantTokenService);
	const { roomId, participantName, secret, leaveRedirectUrl, showOnlyRecordings } = extractParams(route);

	if (isValidUrl(leaveRedirectUrl)) {
		navigationService.setLeaveRedirectUrl(leaveRedirectUrl);
	}

	if (!secret) {
		// If no secret is provided, redirect to the error page
		return navigationService.redirectToErrorPage(ErrorReason.MISSING_ROOM_SECRET);
	}

	roomService.setRoomId(roomId);
	roomService.setRoomSecret(secret);

	if (participantName) {
		participantService.setParticipantName(participantName);
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

const extractParams = ({ params, queryParams }: ActivatedRouteSnapshot) => ({
	roomId: params['room-id'],
	participantName: queryParams[WebComponentProperty.PARTICIPANT_NAME],
	secret: queryParams['secret'],
	leaveRedirectUrl: queryParams[WebComponentProperty.LEAVE_REDIRECT_URL],
	showOnlyRecordings: queryParams[WebComponentProperty.SHOW_ONLY_RECORDINGS] || 'false'
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
