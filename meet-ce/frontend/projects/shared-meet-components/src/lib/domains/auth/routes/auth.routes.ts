import { DomainRouteConfig } from '../../../shared/models/domain-routes.model';
import { checkUserNotAuthenticatedGuard } from '../guards/auth.guard';

/**
 * Auth domain route configurations
 */
export const authDomainRoutes: DomainRouteConfig[] = [
	{
		route: {
			path: 'login',
			loadComponent: () => import('../pages/login/login.component').then((m) => m.LoginComponent),
			canActivate: [checkUserNotAuthenticatedGuard]
		}
	}
];
