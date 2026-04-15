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
	},
	{
		route: {
			path: 'users/new',
			loadComponent: () => import('../pages/create-user/create-user.component').then((m) => m.CreateUserComponent)
		}
	},
	{
		route: {
			path: 'users/:user-id',
			loadComponent: () => import('../pages/profile/profile.component').then((m) => m.ProfileComponent)
		}
	},
	// Profile page is not shown in the main navigation, but we want it to be a child route of the console shell
	{
		route: {
			path: 'profile',
			loadComponent: () => import('../pages/profile/profile.component').then((m) => m.ProfileComponent)
		}
	}
];
