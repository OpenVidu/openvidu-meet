import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn } from '@angular/router';
import { ErrorReason } from '../models';
import { AppDataService, NavigationService, ParticipantService, RoomService, SessionStorageService } from '../services';
import { WebComponentProperty } from '@openvidu-meet/typings';

export const extractRoomQueryParamsGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
	const navigationService = inject(NavigationService);
	const roomService = inject(RoomService);
	const participantService = inject(ParticipantService);
	const sessionStorageService = inject(SessionStorageService);

	const {
		roomId,
		secret: querySecret,
		participantName,
		leaveRedirectUrl,
		showOnlyRecordings,
		e2eeKey
	} = extractParams(route);
	const secret = querySecret || sessionStorageService.getRoomSecret();

	// Handle leave redirect URL logic
	handleLeaveRedirectUrl(leaveRedirectUrl);

	if (!secret) {
		// If no secret is provided, redirect to the error page
		return navigationService.redirectToErrorPage(ErrorReason.MISSING_ROOM_SECRET);
	}

	roomService.setRoomId(roomId);
	roomService.setRoomSecret(secret);
	roomService.setE2EEKey(e2eeKey);

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

	const { roomId, secret: querySecret } = extractParams(route);
	const secret = querySecret || sessionStorageService.getRoomSecret();

	if (!secret) {
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
	showOnlyRecordings: (queryParams[WebComponentProperty.SHOW_ONLY_RECORDINGS] as string) || 'false',
	e2eeKey: queryParams[WebComponentProperty.E2EE_KEY] as string
});

/**
 * Handles the leave redirect URL logic with automatic referrer detection
 */
const handleLeaveRedirectUrl = (leaveRedirectUrl: string | undefined) => {
	const navigationService = inject(NavigationService);
	const appDataService = inject(AppDataService);
	const isEmbeddedMode = appDataService.isEmbeddedMode();

	// Explicit valid URL provided - use as is
	if (leaveRedirectUrl && isValidUrl(leaveRedirectUrl)) {
		navigationService.setLeaveRedirectUrl(leaveRedirectUrl);
		return;
	}

	// Absolute path provided in embedded mode - construct full URL based on parent origin
	if (isEmbeddedMode && leaveRedirectUrl?.startsWith('/')) {
		const parentUrl = document.referrer;
		const parentOrigin = new URL(parentUrl).origin;
		navigationService.setLeaveRedirectUrl(parentOrigin + leaveRedirectUrl);
		return;
	}

	// Auto-detect from referrer (only if no explicit URL provided and not embedded)
	if (!leaveRedirectUrl && !isEmbeddedMode) {
		const autoRedirectUrl = getAutoRedirectUrl();
		if (autoRedirectUrl) {
			navigationService.setLeaveRedirectUrl(autoRedirectUrl);
		}
	}
};

/**
 * Automatically detects if user came from another domain and returns appropriate redirect URL
 */
const getAutoRedirectUrl = (): string | null => {
	try {
		const referrer = document.referrer;

		// No referrer means user typed URL directly or came from bookmark
		if (!referrer) {
			return null;
		}

		const referrerUrl = new URL(referrer);
		const currentUrl = new URL(window.location.href);

		// Check if referrer is from a different domain
		if (referrerUrl.origin !== currentUrl.origin) {
			console.log(`Auto-configuring leave redirect to referrer: ${referrer}`);
			return referrer;
		}

		return null;
	} catch (error) {
		console.warn('Error detecting auto redirect URL:', error);
		return null;
	}
};

const isValidUrl = (url: string) => {
	try {
		new URL(url);
		return true;
	} catch (error) {
		return false;
	}
};
