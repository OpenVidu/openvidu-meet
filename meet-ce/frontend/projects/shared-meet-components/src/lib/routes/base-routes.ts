import { Routes } from '@angular/router';
import { WebComponentProperty } from '@openvidu-meet/typings';
import {
	checkRoomEditGuard,
	checkUserAuthenticatedGuard,
	checkUserNotAuthenticatedGuard,
	extractRecordingQueryParamsGuard,
	extractRoomQueryParamsGuard,
	removeQueryParamsGuard,
	runGuardsSerially,
	validateRecordingAccessGuard,
	validateRoomAccessGuard,
	validateRoomRecordingsAccessGuard
} from '../guards';
import {
	ConfigComponent,
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
	ViewRecordingComponent
} from '../pages';

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
				validateRoomAccessGuard,
				removeQueryParamsGuard(['secret', WebComponentProperty.E2EE_KEY])
			)
		]
	},
	{
		path: 'room/:room-id/recordings',
		component: RoomRecordingsComponent,
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
		component: ViewRecordingComponent,
		canActivate: [validateRecordingAccessGuard]
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
				component: RoomWizardComponent,
				canActivate: [checkRoomEditGuard]
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
