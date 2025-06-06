import { Routes } from '@angular/router';
import {
	applicationModeGuard,
	checkParticipantRoleAndAuthGuard,
	checkUserAuthenticatedGuard,
	checkUserNotAuthenticatedGuard,
	extractRecordingQueryParamsGuard,
	extractRoomQueryParamsGuard,
	removeModeratorSecretGuard,
	runGuardsSerially,
	validateRecordingAccessGuard
} from '../guards';
import {
	ConsoleComponent,
	DisconnectedComponent,
	ErrorComponent,
	LoginComponent,
	OverviewComponent,
	RecordingsComponent,
	RoomFormComponent,
	RoomRecordingsComponent,
	RoomsComponent,
	VideoRoomComponent
} from '../pages';

export const baseRoutes: Routes = [
	{
		path: 'login',
		component: LoginComponent,
		canActivate: [checkUserNotAuthenticatedGuard]
	},
	{
		path: 'console',
		component: ConsoleComponent,
		canActivate: [checkUserAuthenticatedGuard],
		children: [
			{
				path: '',
				redirectTo: 'overview',
				pathMatch: 'full'
			},
			{
				path: 'overview',
				component: OverviewComponent
			},
			{
				path: 'rooms',
				component: RoomsComponent,
				children: [
					{ path: 'new', component: RoomFormComponent },
					{ path: ':roomId/edit', component: RoomFormComponent }
				]
			},
			{
				path: 'recordings',
				component: RecordingsComponent
			},
			// {
			// 	path: 'access-permissions',
			// 	component: AccessPermissionsComponent
			// },
			// {
			// 	path: 'appearance',
			// 	component: AppearanceComponent
			// },

			// {
			// 	path: 'security-preferences',
			// 	component: SecurityPreferencesComponent
			// },
			// {
			// 	path: 'about',
			// 	component: AboutComponent
			// },
			{ path: '**', redirectTo: 'overview' }
		]
	},
	{
		path: 'room/:room-id',
		component: VideoRoomComponent,
		canActivate: [
			runGuardsSerially(applicationModeGuard, extractRoomQueryParamsGuard, checkParticipantRoleAndAuthGuard)
		]
	},
	{
		path: 'room/:room-id/recordings',
		component: RoomRecordingsComponent,
		canActivate: [
			runGuardsSerially(
				applicationModeGuard,
				extractRecordingQueryParamsGuard,
				checkParticipantRoleAndAuthGuard,
				validateRecordingAccessGuard,
				removeModeratorSecretGuard
			)
		]
	},
	{ path: 'disconnected', component: DisconnectedComponent },
	{ path: 'error', component: ErrorComponent },

	// Redirect all other routes to the console
	{ path: '**', redirectTo: 'console' }
];
