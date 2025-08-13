import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn } from '@angular/router';
import { ErrorReason } from '@lib/models';
import { NavigationService, ParticipantService, RoomService, SessionStorageService } from '@lib/services';
import { WebComponentProperty } from '@lib/typings/ce/webcomponent/properties.model';

export const extractRoomQueryParamsGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
	const navigationService = inject(NavigationService);
	const roomService = inject(RoomService);
	const participantService = inject(ParticipantService);
	const sessionStorageService = inject(SessionStorageService);

	const { roomId, secret: querySecret, participantName, leaveRedirectUrl, showOnlyRecordings } = extractParams(route);
	const secret = querySecret || sessionStorageService.getRoomSecret(roomId);

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
	const storedSecret = sessionStorageService.getRoomSecret(roomId);

	if (!secret && !storedSecret) {
		// If no secret is provided, redirect to the error page
		return navigationService.redirectToErrorPage(ErrorReason.MISSING_ROOM_SECRET);
	}

	roomService.setRoomId(roomId);
	roomService.setRoomSecret(secret);

	return true;
};

const extractParams = ({ params, queryParams }: ActivatedRouteSnapshot) => ({
	roomId: params['room-id'] as string,
	secret: queryParams['secret'] as string,
	participantName: queryParams[WebComponentProperty.PARTICIPANT_NAME] as string,
	leaveRedirectUrl: queryParams[WebComponentProperty.LEAVE_REDIRECT_URL] as string,
	showOnlyRecordings: (queryParams[WebComponentProperty.SHOW_ONLY_RECORDINGS] as string) || 'false'
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
