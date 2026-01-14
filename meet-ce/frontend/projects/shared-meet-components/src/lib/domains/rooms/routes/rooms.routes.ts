import { WebComponentProperty } from '@openvidu-meet/typings';
import { extractRecordingQueryParamsGuard } from '../../../shared/guards/extract-query-params.guard';
import { removeQueryParamsGuard } from '../../../shared/guards/remove-query-params.guard';
import { runGuardsSerially } from '../../../shared/guards/run-serially.guard';
import { DomainRouteConfig } from '../../../shared/models/domain-routes.model';
import { checkEditableRoomGuard } from '../guards/room-edit-check.guard';
import { validateRoomRecordingsAccessGuard } from '../guards/room-validate-access.guard';

/**
 * Rooms domain route configurations
 */
export const roomsDomainRoutes: DomainRouteConfig[] = [
	{
		route: {
			path: 'room/:room-id/recordings',
			loadComponent: () =>
				import('../pages/room-recordings/room-recordings.component').then((m) => m.RoomRecordingsComponent),
			canActivate: [
				runGuardsSerially(
					extractRecordingQueryParamsGuard,
					validateRoomRecordingsAccessGuard,
					removeQueryParamsGuard(['secret', WebComponentProperty.E2EE_KEY])
				)
			]
		}
	}
];

/**
 * Console child routes for rooms domain
 */
export const roomsConsoleRoutes: DomainRouteConfig[] = [
	{
		route: {
			path: 'rooms',
			loadComponent: () => import('../pages/rooms/rooms.component').then((m) => m.RoomsComponent)
		},
		navMetadata: {
			label: 'Rooms',
			route: 'rooms',
			icon: 'video_chat',
			iconClass: 'ov-room-icon',
			order: 2
		}
	},
	{
		route: {
			path: 'rooms/new',
			loadComponent: () => import('../pages/room-wizard/room-wizard.component').then((m) => m.RoomWizardComponent)
		}
	},
	{
		route: {
			path: 'rooms/:roomId/edit',
			loadComponent: () => import('../pages/room-wizard/room-wizard.component').then((m) => m.RoomWizardComponent),
			canActivate: [checkEditableRoomGuard]
		}
	}
];
