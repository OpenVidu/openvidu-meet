import { Routes } from '@angular/router';
import {
	checkParticipantRoleAndAuthGuard,
	checkRecordingAuthGuard,
	checkUserAuthenticatedGuard,
	checkUserNotAuthenticatedGuard,
	extractRecordingQueryParamsGuard,
	extractRoomQueryParamsGuard,
	removeModeratorSecretGuard,
	runGuardsSerially,
	validateRecordingAccessGuard
} from '@lib/guards';
import {
	ConsoleComponent,
	DevelopersSettingsComponent,
	DisconnectedComponent,
	ErrorComponent,
	LoginComponent,
	OverviewComponent,
	RecordingsComponent,
	RoomRecordingsComponent,
	RoomsComponent,
	RoomWizardComponent,
	UsersPermissionsComponent,
	VideoRoomComponent,
	ViewRecordingComponent
} from '@lib/pages';

export const baseRoutes: Routes = [
	{
		path: 'login',
		component: LoginComponent,
		canActivate: [checkUserNotAuthenticatedGuard]
	},
	{
		path: 'room/:room-id',
		component: VideoRoomComponent,
		canActivate: [runGuardsSerially(extractRoomQueryParamsGuard, checkParticipantRoleAndAuthGuard)]
	},
	{
		path: 'room/:room-id/recordings',
		component: RoomRecordingsComponent,
		canActivate: [
			runGuardsSerially(
				extractRecordingQueryParamsGuard,
				checkParticipantRoleAndAuthGuard,
				validateRecordingAccessGuard,
				removeModeratorSecretGuard
			)
		]
	},
	{
		path: 'recording/:recording-id',
		component: ViewRecordingComponent,
		canActivate: [checkRecordingAuthGuard]
	},
	{ path: 'disconnected', component: DisconnectedComponent },
	{ path: 'error', component: ErrorComponent },
	{
		path: '',
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
				component: RoomsComponent
			},
			{
				path: 'rooms/new',
				component: RoomWizardComponent
			},
			{
				path: 'rooms/:roomId/edit',
				component: RoomWizardComponent
			},
			{
				path: 'recordings',
				component: RecordingsComponent
			},
			{
				path: 'embedded',
				component: DevelopersSettingsComponent
			},
			{
				path: 'users-permissions',
				component: UsersPermissionsComponent
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
