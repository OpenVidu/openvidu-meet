import { Routes } from '@angular/router';
import { WebComponentProperty } from '@openvidu-meet/typings';
import { checkUserAuthenticatedGuard, checkUserNotAuthenticatedGuard } from '../../domains/auth/guards/auth.guard';
import { validateRecordingAccessGuard } from '../../domains/recordings/guards/recording-validate-access.guard';
import { checkEditableRoomGuard } from '../../domains/rooms/guards/room-edit-check.guard';
import {
	validateRoomAccessGuard,
	validateRoomRecordingsAccessGuard
} from '../../domains/rooms/guards/room-validate-access.guard';
import { extractRecordingQueryParamsGuard, extractRoomQueryParamsGuard } from '../guards/extract-query-params.guard';
import { removeQueryParamsGuard } from '../guards/remove-query-params.guard';
import { runGuardsSerially } from '../guards/run-serially.guard';
export const baseRoutes: Routes = [
	{
		path: 'login',
		loadComponent: () => import('../../domains/auth/pages/login/login.component').then((m) => m.LoginComponent),
		canActivate: [checkUserNotAuthenticatedGuard]
	},
	{
		path: 'room/:room-id',
		loadComponent: () =>
			import('../../domains/meeting/pages/meeting/meeting.component').then((m) => m.MeetingComponent),
		canActivate: [
			runGuardsSerially(
				extractRoomQueryParamsGuard,
				validateRoomAccessGuard,
				removeQueryParamsGuard(['secret', WebComponentProperty.E2EE_KEY])
			)
		]
	},
	{
		path: 'room/:room-id/recordings',
		loadComponent: () =>
			import('../../domains/rooms/pages/room-recordings/room-recordings.component').then(
				(m) => m.RoomRecordingsComponent
			),
		canActivate: [
			runGuardsSerially(
				extractRecordingQueryParamsGuard,
				validateRoomRecordingsAccessGuard,
				removeQueryParamsGuard(['secret', WebComponentProperty.E2EE_KEY])
			)
		]
	},
	{
		path: 'recording/:recording-id',
		loadComponent: () =>
			import('../../domains/recordings/pages/view-recording/view-recording.component').then(
				(m) => m.ViewRecordingComponent
			),
		canActivate: [validateRecordingAccessGuard]
	},
	{
		path: 'disconnected',
		loadComponent: () =>
			import('../../domains/meeting/pages/end-meeting/end-meeting.component').then((m) => m.EndMeetingComponent)
	},
	{
		path: 'error',
		loadComponent: () => import('../../domains/console/pages/error/error.component').then((m) => m.ErrorComponent)
	},
	{
		path: '',
		loadComponent: () =>
			import('../../domains/console/pages/console/console.component').then((m) => m.ConsoleComponent),
		canActivate: [checkUserAuthenticatedGuard],
		children: [
			{
				path: '',
				redirectTo: 'overview',
				pathMatch: 'full'
			},
			{
				path: 'overview',
				loadComponent: () =>
					import('../../domains/console/pages/overview/overview.component').then((m) => m.OverviewComponent)
			},
			{
				path: 'rooms',
				loadComponent: () =>
					import('../../domains/rooms/pages/rooms/rooms.component').then((m) => m.RoomsComponent)
			},
			{
				path: 'rooms/new',

				loadComponent: () =>
					import('../../domains/rooms/pages/room-wizard/room-wizard.component').then(
						(m) => m.RoomWizardComponent
					)
			},
			{
				path: 'rooms/:roomId/edit',
				loadComponent: () =>
					import('../../domains/rooms/pages/room-wizard/room-wizard.component').then(
						(m) => m.RoomWizardComponent
					),
				canActivate: [checkEditableRoomGuard]
			},
			{
				path: 'recordings',
				loadComponent: () =>
					import('../../domains/recordings/pages/recordings/recordings.component').then(
						(m) => m.RecordingsComponent
					)
			},
			{
				path: 'embedded',
				loadComponent: () =>
					import('../../domains/console/pages/embedded/embedded.component').then((m) => m.EmbeddedComponent)
			},
			{
				path: 'users-permissions',
				loadComponent: () =>
					import('../../domains/console/pages/users-permissions/users-permissions.component').then(
						(m) => m.UsersPermissionsComponent
					)
			},
			{
				path: 'config',
				loadComponent: () =>
					import('../../domains/console/pages/config/config.component').then((m) => m.ConfigComponent)
			},
			// {
			// 	path: 'about',
			// 	component: AboutComponent
			// },
			{ path: '**', redirectTo: 'overview' }
		]
	},

	// Redirect all other routes to the console
	{ path: '**', redirectTo: '' }
];
