import { Routes } from '@angular/router';

import { UnauthorizedComponent } from '../components';
import {
	checkAdminAuthenticatedGuard,
	checkAdminNotAuthenticatedGuard,
	validateRoomAccessGuard,
	applicationModeGuard,
	extractQueryParamsGuard,
	checkParticipantNameGuard,
	replaceModeratorSecretGuard
} from '../guards';
import {
	AboutComponent,
	AccessPermissionsComponent,
	AppearanceComponent,
	ConsoleComponent,
	ConsoleLoginComponent,
	DisconnectedComponent,
	RoomCreatorComponent,
	OverviewComponent,
	ParticipantNameFormComponent,
	RecordingsComponent,
	RoomsComponent,
	SecurityPreferencesComponent,
	VideoRoomComponent
} from '../pages';

export const baseRoutes: Routes = [
	{ path: '', component: RoomCreatorComponent },
	{ path: 'disconnected', component: DisconnectedComponent },
	{ path: 'unauthorized', component: UnauthorizedComponent },
	{
		path: 'console/login',
		component: ConsoleLoginComponent,
		canActivate: [checkAdminNotAuthenticatedGuard]
	},
	{
		path: 'console',
		component: ConsoleComponent,
		canActivate: [checkAdminAuthenticatedGuard],
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
		path: 'room/:room-name',
		component: VideoRoomComponent,
		canActivate: [
			applicationModeGuard,
			extractQueryParamsGuard,
			checkParticipantNameGuard,
			validateRoomAccessGuard,
			replaceModeratorSecretGuard
		]
	},
	{
		path: 'room/:room-name/participant-name',
		component: ParticipantNameFormComponent
	},

	// Redirect all other routes to RoomCreatorComponent
	{ path: '**', redirectTo: '' }
];
