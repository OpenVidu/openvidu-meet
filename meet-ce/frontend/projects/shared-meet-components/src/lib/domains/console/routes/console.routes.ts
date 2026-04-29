import { Route } from '@angular/router';
import { MeetUserRole } from '@openvidu-meet/typings';
import { DomainRouteConfig } from '../../../shared/models/domain-routes.model';
import {
	checkPasswordChangeNotRequiredGuard,
	checkRoleGuard,
	checkUserAuthenticatedGuard
} from '../../auth/guards/auth.guard';
import { recordingsConsoleRoutes } from '../../recordings/routes/recordings.routes';
import { roomMembersConsoleRoutes } from '../../room-members/routes/room-members.routes';
import { roomsConsoleRoutes } from '../../rooms/routes/rooms.routes';
import { usersConsoleRoutes } from '../../users/routes/users.routes';
import { clearRoomSessionGuard } from '../guards/clear-room-session.guard';

/**
 * All console child routes configuration (includes console pages + rooms + recordings)
 * Used by ConsoleComponent to build navigation links
 */
export const consoleChildRoutes: DomainRouteConfig[] = [
	{
		route: {
			path: 'overview',
			loadComponent: () => import('../pages/overview/overview.component').then((m) => m.OverviewComponent),
			canActivate: [checkRoleGuard([MeetUserRole.ADMIN])]
		},
		navMetadata: {
			label: 'Overview',
			route: 'overview',
			icon: 'dashboard',
			order: 1,
			allowedRoles: [MeetUserRole.ADMIN]
		}
	},
	...roomsConsoleRoutes,
	...roomMembersConsoleRoutes,
	...recordingsConsoleRoutes,
	...usersConsoleRoutes,
	{
		route: {
			path: 'embedded',
			loadComponent: () => import('../pages/embedded/embedded.component').then((m) => m.EmbeddedComponent),
			canActivate: [checkRoleGuard([MeetUserRole.ADMIN])]
		},
		navMetadata: {
			label: 'Embedded',
			route: 'embedded',
			icon: 'code_blocks',
			iconClass: 'material-symbols-outlined ov-developer-icon',
			order: 5,
			allowedRoles: [MeetUserRole.ADMIN]
		}
	},
	{
		route: {
			path: 'config',
			loadComponent: () => import('../pages/config/config.component').then((m) => m.ConfigComponent),
			canActivate: [checkRoleGuard([MeetUserRole.ADMIN])]
		},
		navMetadata: {
			label: 'Configuration',
			route: 'config',
			icon: 'settings',
			iconClass: 'ov-settings-icon',
			order: 6,
			allowedRoles: [MeetUserRole.ADMIN]
		}
	}
];

/**
 * Console domain routes (error page + authenticated console with all child routes)
 */
export const consoleDomainRoutes: Route[] = [
	{
		path: 'error',
		loadComponent: () => import('../pages/error/error.component').then((m) => m.ErrorComponent)
	},
	{
		path: '',
		loadComponent: () => import('../pages/console/console.component').then((m) => m.ConsoleComponent),
		canActivate: [checkUserAuthenticatedGuard, checkPasswordChangeNotRequiredGuard, clearRoomSessionGuard],
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
