import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, RouterStateSnapshot } from '@angular/router';
import { WebComponentManagerService, ContextService } from '../services';
import { ApplicationMode } from 'projects/shared-meet-components/src/public-api';

export const applicationModeGuard: CanActivateFn = async (
	_route: ActivatedRouteSnapshot,
	_state: RouterStateSnapshot
) => {
	const contextService = inject(ContextService);
	const commandsManagerService = inject(WebComponentManagerService);

	const isRequestedFromIframe = window.self !== window.top;

	const applicationMode = isRequestedFromIframe ? ApplicationMode.EMBEDDED : ApplicationMode.STANDALONE;
	contextService.setApplicationMode(applicationMode);

	if (contextService.isEmbeddedMode()) {
		// Start listening for commands from the iframe
		commandsManagerService.startCommandsListener();
	}

	return true;
};
