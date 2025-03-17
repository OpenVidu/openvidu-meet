import { Routes } from '@angular/router';

import { UnauthorizedComponent } from '../components';
import {
	checkUserAuthenticatedGuard,
	checkUserNotAuthenticatedGuard,
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
	VideoRoomComponent,
	RoomFormComponent
} from '../pages';
import { LoginComponent } from '@lib/pages/login/login.component';
import { Role } from '@lib/typings/ce';

export const baseRoutes: Routes = [
	{
		path: '',
		component: RoomCreatorComponent,
		canActivate: [checkUserAuthenticatedGuard],
		data: {
			expectedRoles: [Role.USER],
			redirectToUnauthorized: 'login',
			redirectToInvalidRole: 'console'
		}
	},
	{
		path: 'login',
		component: LoginComponent,
		canActivate: [checkUserNotAuthenticatedGuard],
		data: { redirectTo: '' }
	},
	{ path: 'disconnected', component: DisconnectedComponent },
	{ path: 'unauthorized', component: UnauthorizedComponent },
	{
		path: 'console/login',
		component: ConsoleLoginComponent,
		canActivate: [checkUserNotAuthenticatedGuard],
		data: { redirectTo: 'console' }
	},
	{
		path: 'console',
		component: ConsoleComponent,
		canActivate: [checkUserAuthenticatedGuard],
		data: {
			expectedRoles: [Role.ADMIN],
			redirectToUnauthorized: 'console/login',
			redirectToInvalidRole: ''
		},
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
					{ path: ':roomName/edit', component: RoomFormComponent }
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
