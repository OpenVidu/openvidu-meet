import { DomainRouteConfig } from '../../../shared/models/domain-routes.model';

/**
 * Room Members domain route configurations
 */
export const roomMembersDomainRoutes: DomainRouteConfig[] = [];

/**
 * Console child routes for room members domain
 */
export const roomMembersConsoleRoutes: DomainRouteConfig[] = [
	{
		route: {
			path: 'rooms/:room-id/members/new',
			loadComponent: () =>
				import('../pages/add-room-member/add-room-member.component').then((m) => m.AddRoomMemberComponent)
		}
	}
];
