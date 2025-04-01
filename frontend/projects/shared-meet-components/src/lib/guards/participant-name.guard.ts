import { inject } from '@angular/core';
import { CanActivateFn, RedirectCommand } from '@angular/router';
import { Router } from '@angular/router';
import { ContextService } from '../services';

export const checkParticipantNameGuard: CanActivateFn = (route, state) => {
	const router = inject(Router);
	const contextService = inject(ContextService);
	const roomId = route.params['room-id'];
	const hasParticipantName = !!contextService.getParticipantName();

	// Check if participant name exists in the service
	if (!hasParticipantName) {
		// Redirect to a page where the participant can input their participant name
		const participantNameRoute = router.createUrlTree([`room/${roomId}/participant-name`], {
			queryParams: { originUrl: state.url, t: Date.now() }
		});
		return new RedirectCommand(participantNameRoute, {
			skipLocationChange: true
		});
	}

	// Proceed if the name exists
	return true;
};
