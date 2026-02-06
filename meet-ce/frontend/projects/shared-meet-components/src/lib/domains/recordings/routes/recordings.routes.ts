import { WebComponentProperty } from '@openvidu-meet/typings';
import { extractRecordingQueryParamsGuard } from '../../../shared/guards/extract-query-params.guard';
import { removeQueryParamsGuard } from '../../../shared/guards/remove-query-params.guard';
import { runGuardsSerially } from '../../../shared/guards/run-serially.guard';
import { DomainRouteConfig } from '../../../shared/models/domain-routes.model';
import { validateRoomRecordingsAccessGuard } from '../../rooms/guards/room-validate-access.guard';
import { validateRecordingAccessGuard } from '../guards/recording-validate-access.guard';

/**
 * Recordings domain public route configurations
 */
export const recordingsDomainRoutes: DomainRouteConfig[] = [
	{
		route: {
			path: 'room/:room-id/recordings',
			loadComponent: () =>
				import('../../recordings/pages/room-recordings/room-recordings.component').then(
					(m) => m.RoomRecordingsComponent
				),
			canActivate: [
				runGuardsSerially(
					extractRecordingQueryParamsGuard,
					validateRoomRecordingsAccessGuard,
					removeQueryParamsGuard(['secret', WebComponentProperty.E2EE_KEY])
				)
			]
		}
	},
	{
		route: {
			path: 'recording/:recording-id',
			loadComponent: () =>
				import('../pages/view-recording/view-recording.component').then((m) => m.ViewRecordingComponent),
			canActivate: [validateRecordingAccessGuard]
		}
	}
];

/**
 * Console child routes for recordings domain
 */
export const recordingsConsoleRoutes: DomainRouteConfig[] = [
	{
		route: {
			path: 'recordings',
			loadComponent: () => import('../pages/recordings/recordings.component').then((m) => m.RecordingsComponent)
		},
		navMetadata: {
			label: 'Recordings',
			route: 'recordings',
			icon: 'video_library',
			iconClass: 'ov-recording-icon',
			order: 3
		}
	}
];
