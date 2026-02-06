import { DomainRouteConfig } from '../../../shared/models/domain-routes.model';

/**
 * Users domain public route configurations
 */
export const usersDomainRoutes: DomainRouteConfig[] = [];

/**
 * Console child routes for users domain
 */
export const usersConsoleRoutes: DomainRouteConfig[] = [
	{
		route: {
			path: 'users',
			loadComponent: () => import('../pages/users/users.component').then((m) => m.UsersComponent)
		},
		navMetadata: {
			label: 'Users',
			route: 'users',
			icon: 'group',
			iconClass: 'ov-users material-symbols-outlined',
			order: 4
		}
	}
];
