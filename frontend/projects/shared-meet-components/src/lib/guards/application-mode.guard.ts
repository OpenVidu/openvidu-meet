import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, RouterStateSnapshot } from '@angular/router';
import { ApplicationMode } from '../models';
import { AppDataService, WebComponentManagerService } from '../services';

export const applicationModeGuard: CanActivateFn = (_route: ActivatedRouteSnapshot, _state: RouterStateSnapshot) => {
	const appDataService = inject(AppDataService);
	const commandsManagerService = inject(WebComponentManagerService);

	const isRequestedFromIframe = window.self !== window.top;

	const applicationMode = isRequestedFromIframe ? ApplicationMode.EMBEDDED : ApplicationMode.STANDALONE;
	appDataService.setApplicationMode(applicationMode);

	if (appDataService.isEmbeddedMode()) {
		// Start listening for commands from the iframe
		commandsManagerService.startCommandsListener();
	}

	return true;
};
