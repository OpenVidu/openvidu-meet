import { MeetUserRole } from '@openvidu-meet/typings';
import { removeQueryParamsGuard } from '../../../shared/guards/remove-query-params.guard';
import { runGuardsSerially } from '../../../shared/guards/run-serially.guard';
import {
	ACCESS_TOKEN_QUERY_PARAM,
	REFRESH_TOKEN_QUERY_PARAM,
	storeTokensFromQueryParamsGuard
} from '../../../shared/guards/store-tokens-from-query-params.guard';
import { DomainRouteConfig } from '../../../shared/models/domain-routes.model';
import {
	extractRecordingParamsGuard,
	extractRoomRecordingsParamsGuard
} from '../guards/extract-recordings-params.guard';
import { checkRecordingAccessGuard } from '../guards/recording-access.guard';
import {
	validateRecordingAccessGuard,
	validateRoomRecordingsAccessGuard
} from '../guards/validate-recordings-access.guard';

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
					storeTokensFromQueryParamsGuard,
					extractRoomRecordingsParamsGuard,
					validateRoomRecordingsAccessGuard,
					removeQueryParamsGuard(['secret', ACCESS_TOKEN_QUERY_PARAM, REFRESH_TOKEN_QUERY_PARAM])
				)
			]
		}
	},
	{
		route: {
			path: 'recording/:recording-id',
			loadComponent: () =>
				import('../pages/view-recording/view-recording.component').then((m) => m.ViewRecordingComponent),
			canActivate: [
				runGuardsSerially(
					storeTokensFromQueryParamsGuard,
					extractRecordingParamsGuard,
					validateRecordingAccessGuard,
					removeQueryParamsGuard(['secret', ACCESS_TOKEN_QUERY_PARAM, REFRESH_TOKEN_QUERY_PARAM])
				)
			]
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
			label: 'NAV.RECORDINGS',
			route: 'recordings',
			icon: 'video_library',
			iconClass: 'ov-recording-icon',
			order: 3,
			allowedRoles: [MeetUserRole.ADMIN, MeetUserRole.ROOM_MANAGER, MeetUserRole.ROOM_MEMBER]
		}
	},
	{
		route: {
			path: 'recordings/:recording-id',
			loadComponent: () =>
				import('../pages/recording-detail/recording-detail.component').then((m) => m.RecordingDetailComponent),
			canActivate: [checkRecordingAccessGuard]
		}
	}
];
