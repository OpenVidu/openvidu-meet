import { WebComponentProperty } from '@openvidu-meet/typings';
import { extractRoomQueryParamsGuard } from '../../../shared/guards/extract-query-params.guard';
import { removeQueryParamsGuard } from '../../../shared/guards/remove-query-params.guard';
import { runGuardsSerially } from '../../../shared/guards/run-serially.guard';
import { DomainRouteConfig } from '../../../shared/models/domain-routes.model';
import { validateRoomAccessGuard } from '../../rooms/guards/room-validate-access.guard';

/**
 * Meeting domain route configurations
 */
export const meetingDomainRoutes: DomainRouteConfig[] = [
	{
		route: {
			path: 'room/:room-id',
			loadComponent: () => import('../pages/meeting/meeting.component').then((m) => m.MeetingComponent),
			canActivate: [
				runGuardsSerially(
					extractRoomQueryParamsGuard,
					validateRoomAccessGuard,
					removeQueryParamsGuard(['secret', WebComponentProperty.E2EE_KEY])
				)
			]
		}
	},
	{
		route: {
			path: 'disconnected',
			loadComponent: () => import('../pages/end-meeting/end-meeting.component').then((m) => m.EndMeetingComponent)
		}
	}
];
