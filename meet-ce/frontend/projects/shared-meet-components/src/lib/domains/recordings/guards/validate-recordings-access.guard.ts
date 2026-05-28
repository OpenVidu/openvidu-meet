import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, RouterStateSnapshot } from '@angular/router';
import { NavigationService } from '../../../shared/services';
import { RecordingEntryService } from '../services/recording-entry.service';
import { RoomRecordingsEntryService } from '../services/room-recordings-entry.service';

/**
 * Adapter guard: delegates the room-recordings permission check to
 * {@link RoomRecordingsEntryService.validate} and maps the outcome to a
 * {@link CanActivateFn} return value.
 */
export const validateRoomRecordingsAccessGuard: CanActivateFn = async (
	_route: ActivatedRouteSnapshot,
	_state: RouterStateSnapshot
) => {
	const roomRecordingsEntry = inject(RoomRecordingsEntryService);
	const navigationService = inject(NavigationService);

	const outcome = await roomRecordingsEntry.validate();
	if (outcome.kind === 'ready') {
		return true;
	}
	return navigationService.redirectToErrorPage(outcome.reason);
};

/**
 * Adapter guard: delegates the two-mode access check (room permission OR
 * recording-secret fallback) to {@link RecordingEntryService.validate}, then
 * maps the outcome to a {@link CanActivateFn} return value. The login redirect
 * carries the current URL so the user is returned here after authenticating.
 */
export const validateRecordingAccessGuard: CanActivateFn = async (
	route: ActivatedRouteSnapshot,
	state: RouterStateSnapshot
) => {
	const recordingEntry = inject(RecordingEntryService);
	const navigationService = inject(NavigationService);

	const recordingId = route.params['recording-id'] as string;
	const recordingSecret = route.queryParams['recordingSecret'] as string | undefined;

	const outcome = await recordingEntry.validate({ recordingId, recordingSecret });

	switch (outcome.kind) {
		case 'ready':
			return true;
		case 'login-required':
			return navigationService.redirectToLoginPage(state.url);
		case 'error':
			return navigationService.redirectToErrorPage(outcome.reason);
	}
};
