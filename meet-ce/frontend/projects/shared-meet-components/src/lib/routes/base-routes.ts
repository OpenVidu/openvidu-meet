import { Routes } from '@angular/router';
import {
	checkParticipantRoleAndAuthGuard,
	checkRecordingAuthGuard,
	checkUserAuthenticatedGuard,
	checkUserNotAuthenticatedGuard,
	extractRecordingQueryParamsGuard,
	extractRoomQueryParamsGuard,
	removeQueryParamsGuard,
	runGuardsSerially,
	validateRecordingAccessGuard,
	validateRoomAccessGuard
} from '../guards';
import {
	ConsoleComponent,
	EmbeddedComponent,
	EndMeetingComponent,
	ErrorComponent,
	LoginComponent,
	MeetingComponent,
	OverviewComponent,
	RecordingsComponent,
	RoomRecordingsComponent,
	RoomsComponent,
	RoomWizardComponent,
	UsersPermissionsComponent,
	ViewRecordingComponent,
	ConfigComponent
} from '../pages';
import { WebComponentProperty } from '@openvidu-meet/typings';

export const baseRoutes: Routes = [
	{
		path: 'login',
		component: LoginComponent,
		canActivate: [checkUserNotAuthenticatedGuard]
	},
	{
		path: 'room/:room-id',
		component: MeetingComponent,
		canActivate: [
			runGuardsSerially(
				extractRoomQueryParamsGuard,
				removeQueryParamsGuard(['secret', WebComponentProperty.E2EE_KEY]),
				checkParticipantRoleAndAuthGuard,
				validateRoomAccessGuard
			)
		]
	},
	{
		path: 'room/:room-id/recordings',
		component: RoomRecordingsComponent,
		canActivate: [
			runGuardsSerially(
				extractRecordingQueryParamsGuard,
				removeQueryParamsGuard(['secret', WebComponentProperty.E2EE_KEY]),
				checkParticipantRoleAndAuthGuard,
				validateRecordingAccessGuard
			)
		]
	},
	{
		path: 'recording/:recording-id',
		component: ViewRecordingComponent,
		canActivate: [checkRecordingAuthGuard]
	},
	{ path: 'disconnected', component: EndMeetingComponent },
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
				component: EmbeddedComponent
			},
			{
				path: 'users-permissions',
				component: UsersPermissionsComponent
			},
			{
				path: 'config',
				component: ConfigComponent
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
