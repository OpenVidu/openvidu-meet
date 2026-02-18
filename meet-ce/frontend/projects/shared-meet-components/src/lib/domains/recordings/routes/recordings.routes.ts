import { removeQueryParamsGuard } from '../../../shared/guards/remove-query-params.guard';
import { runGuardsSerially } from '../../../shared/guards/run-serially.guard';
import { DomainRouteConfig } from '../../../shared/models/domain-routes.model';
import { validateRoomRecordingsAccessGuard } from '../../meeting/guards/validate-room-access.guard';
import { extractRoomRecordingsParamsGuard } from '../guards/extract-params.guard';
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
					extractRoomRecordingsParamsGuard,
					validateRoomRecordingsAccessGuard,
					removeQueryParamsGuard(['secret'])
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
	},
	{
		route: {
			path: 'recordings/:recordingId',
			loadComponent: () =>
				import('../pages/recording-detail/recording-detail.component').then(
					(m) => m.RecordingDetailComponent
				)
		}
	}
];
