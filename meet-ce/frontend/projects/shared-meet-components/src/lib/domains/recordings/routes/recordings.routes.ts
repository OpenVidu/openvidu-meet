import { DomainRouteConfig } from '../../../shared/models/domain-routes.model';
import { validateRecordingAccessGuard } from '../guards/recording-validate-access.guard';

/**
 * Recordings domain public route configurations
 */
export const recordingsDomainRoutes: DomainRouteConfig[] = [
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
