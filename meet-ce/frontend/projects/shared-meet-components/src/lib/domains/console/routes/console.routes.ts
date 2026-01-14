import { Route } from '@angular/router';
import { DomainRouteConfig } from '../../../shared/models/domain-routes.model';
import { checkUserAuthenticatedGuard } from '../../auth/guards/auth.guard';
import { recordingsConsoleRoutes } from '../../recordings/routes/recordings.routes';
import { roomsConsoleRoutes } from '../../rooms/routes/rooms.routes';

/**
 * All console child routes configuration (includes console pages + rooms + recordings)
 * Used by ConsoleComponent to build navigation links
 */
export const consoleChildRoutes: DomainRouteConfig[] = [
	{
		route: {
			path: 'overview',
			loadComponent: () => import('../pages/overview/overview.component').then((m) => m.OverviewComponent)
		},
		navMetadata: {
			label: 'Overview',
			route: 'overview',
			icon: 'dashboard',
			order: 1
		}
	},
	...roomsConsoleRoutes,
	...recordingsConsoleRoutes,
	{
		route: {
			path: 'embedded',
			loadComponent: () => import('../pages/embedded/embedded.component').then((m) => m.EmbeddedComponent)
		},
		navMetadata: {
			label: 'Embedded',
			route: 'embedded',
			icon: 'code_blocks',
			iconClass: 'material-symbols-outlined ov-developer-icon',
			order: 4
		}
	},
	{
		route: {
			path: 'users-permissions',
			loadComponent: () =>
				import('../pages/users-permissions/users-permissions.component').then((m) => m.UsersPermissionsComponent)
		},
		navMetadata: {
			label: 'Users & Permissions',
			route: 'users-permissions',
			icon: 'passkey',
			iconClass: 'ov-users-permissions material-symbols-outlined',
			order: 5
		}
	},
	{
		route: {
			path: 'config',
			loadComponent: () => import('../pages/config/config.component').then((m) => m.ConfigComponent)
		},
		navMetadata: {
			label: 'Configuration',
			route: 'config',
			icon: 'settings',
			iconClass: 'ov-settings-icon',
			order: 6
		}
	}
];

/**
 * Console domain routes (error page + authenticated console shell with all child routes)
 * Used by base-routes.ts
 */
export const consoleDomainRoutes: Route[] = [
	{
		path: 'error',
		loadComponent: () => import('../pages/error/error.component').then((m) => m.ErrorComponent)
	},
	{
		path: '',
		loadComponent: () => import('../pages/console/console.component').then((m) => m.ConsoleComponent),
		canActivate: [checkUserAuthenticatedGuard],
		children: [
			{
				path: '',
				redirectTo: 'overview',
				pathMatch: 'full'
			},
			...consoleChildRoutes.map((config) => config.route),
			{ path: '**', redirectTo: 'overview' }
		]
	}
];

