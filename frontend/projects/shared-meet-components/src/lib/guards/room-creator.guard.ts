import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router, RouterStateSnapshot } from '@angular/router';
import { ContextService } from '../services';

export const checkRoomCreatorEnabledGuard: CanActivateFn = async (
	_route: ActivatedRouteSnapshot,
	_state: RouterStateSnapshot
) => {
	const contextService = inject(ContextService);
	const router = inject(Router);

	const isRoomCreatorEnabled = await contextService.canUsersCreateRooms();
	if (!isRoomCreatorEnabled) {
		return router.createUrlTree(['room-creator-disabled']);
	}

	return true;
};
