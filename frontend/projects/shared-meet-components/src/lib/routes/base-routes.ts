import { Routes } from '@angular/router';
import { UserRole } from '@lib/typings/ce';
import { RoomCreatorDisabledComponent, UnauthorizedComponent } from '../components';
import {
	applicationModeGuard,
	checkParticipantNameGuard,
	checkParticipantRoleAndAuthGuard,
	checkRoomCreatorEnabledGuard,
	checkUserAuthenticatedGuard,
	checkUserNotAuthenticatedGuard,
	extractRecordingQueryParamsGuard,
	extractRoomQueryParamsGuard,
	removeModeratorSecretGuard,
	replaceModeratorSecretGuard,
	runGuardsSerially,
	validateRecordingAccessGuard,
	validateRoomAccessGuard
} from '../guards';
import {
	ConsoleComponent,
	ConsoleLoginComponent,
	DisconnectedComponent,
	LoginComponent,
	OverviewComponent,
	ParticipantNameFormComponent,
	RecordingsComponent,
	RoomCreatorComponent,
	RoomFormComponent,
	RoomRecordingsComponent,
	RoomsComponent,
	VideoRoomComponent
} from '../pages';

export const baseRoutes: Routes = [
	{
		path: '',
		component: RoomCreatorComponent,
		canActivate: [runGuardsSerially(checkRoomCreatorEnabledGuard, checkUserAuthenticatedGuard)],
		data: {
			checkSkipAuth: true,
			expectedRoles: [UserRole.USER],
			redirectToWhenUnauthorized: 'login',
			redirectToWhenInvalidRole: 'console'
		}
	},
	{
		path: 'login',
		component: LoginComponent,
		canActivate: [checkUserNotAuthenticatedGuard],
		data: { redirectTo: '' }
	},
	{ path: 'room-creator-disabled', component: RoomCreatorDisabledComponent },
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
			expectedRoles: [UserRole.ADMIN],
			redirectToWhenUnauthorized: 'console/login',
			redirectToWhenInvalidRole: ''
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
			runGuardsSerially(
				applicationModeGuard,
				extractRoomQueryParamsGuard,
				checkParticipantRoleAndAuthGuard,
				checkParticipantNameGuard,
				validateRoomAccessGuard,
				replaceModeratorSecretGuard
			)
		]
	},
	{
		path: 'room/:room-id/participant-name',
		component: ParticipantNameFormComponent
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

	// Redirect all other routes to RoomCreatorComponent
	{ path: '**', redirectTo: '' }
];
