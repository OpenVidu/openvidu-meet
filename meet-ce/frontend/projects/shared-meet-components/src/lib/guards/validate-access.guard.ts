import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, RouterStateSnapshot } from '@angular/router';
import { ErrorReason } from '@lib/models';
import { NavigationService, ParticipantService, RecordingService, RoomService } from '@lib/services';

/**
 * Guard to validate access to a room by generating a participant token.
 */
export const validateRoomAccessGuard: CanActivateFn = async (
	_route: ActivatedRouteSnapshot,
	_state: RouterStateSnapshot
) => {
	const roomService = inject(RoomService);
	const participantTokenService = inject(ParticipantService);
	const navigationService = inject(NavigationService);

	const roomId = roomService.getRoomId();
	const secret = roomService.getRoomSecret();

	try {
		await participantTokenService.generateToken({
			roomId,
			secret
		});
		return true;
	} catch (error: any) {
		console.error('Error generating participant token:', error);
		switch (error.status) {
			case 400:
				// Invalid secret
				return navigationService.redirectToErrorPage(ErrorReason.INVALID_ROOM_SECRET);
			case 404:
				// Room not found
				return navigationService.redirectToErrorPage(ErrorReason.INVALID_ROOM);
			case 409:
				// Room is closed
				return navigationService.redirectToErrorPage(ErrorReason.CLOSED_ROOM);
			default:
				return navigationService.redirectToErrorPage(ErrorReason.INTERNAL_ERROR);
		}
	}
};

/**
 * Guard to validate the access to recordings of a room by generating a recording token.
 */
export const validateRecordingAccessGuard: CanActivateFn = async (
	_route: ActivatedRouteSnapshot,
	_state: RouterStateSnapshot
) => {
	const roomService = inject(RoomService);
	const recordingService = inject(RecordingService);
	const navigationService = inject(NavigationService);

	const roomId = roomService.getRoomId();
	const secret = roomService.getRoomSecret();

	try {
		// Generate a token to access recordings in the room
		await recordingService.generateRecordingToken(roomId, secret);

		if (!recordingService.canRetrieveRecordings()) {
			// If the user does not have permission to retrieve recordings, redirect to the error page
			return navigationService.redirectToErrorPage(ErrorReason.UNAUTHORIZED_RECORDING_ACCESS);
		}

		return true;
	} catch (error: any) {
		console.error('Error generating recording token:', error);
		switch (error.status) {
			case 400:
				// Invalid secret
				return navigationService.redirectToErrorPage(ErrorReason.INVALID_ROOM_SECRET);
			case 403:
				// Recording access is configured for admins only
				return navigationService.redirectToErrorPage(ErrorReason.RECORDINGS_ADMIN_ONLY_ACCESS);
			case 404:
				// There are no recordings in the room or the room does not exist
				return navigationService.redirectToErrorPage(ErrorReason.NO_RECORDINGS);
			default:
				return navigationService.redirectToErrorPage(ErrorReason.INTERNAL_ERROR);
		}
	}
};
