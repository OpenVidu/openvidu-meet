import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router, RouterStateSnapshot } from '@angular/router';
import { ContextService } from 'shared-meet-components';

export const checkRoomCreatorEnabledGuard: CanActivateFn = async (
	_route: ActivatedRouteSnapshot,
	_state: RouterStateSnapshot
) => {
	const contextService = inject(ContextService);
	const router = inject(Router);

	const isRoomCreatorEnabled = await contextService.canUsersCreateRooms();
	if (!isRoomCreatorEnabled) {
		router.navigate(['room-creator-disabled']);
		return false;
	}

	return true;
};
