import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { Router } from '@angular/router';
import { ContextService } from '../services';

export const checkParticipantNameGuard: CanActivateFn = async (route, state) => {
	const router = inject(Router);
	const contextService = inject(ContextService);
	const roomName = route.params['room-name'];
	const hasParticipantName = !!contextService.getParticipantName();

	// Check if participant name exists in the service
	if (!hasParticipantName) {
		// Redirect to a page where the participant can input their participant name
		return router.navigate([`room/${roomName}/participant-name`], {
			queryParams: { originUrl: state.url, t: Date.now() },
			skipLocationChange: true
		});
	}

	// Proceed if the name exists
	return true;
};
