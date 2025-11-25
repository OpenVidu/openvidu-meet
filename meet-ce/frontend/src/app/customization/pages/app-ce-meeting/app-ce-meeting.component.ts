import { Component } from '@angular/core';
import {
	MeetingComponent,
	MeetingCustomLayoutComponent,
	MeetingParticipantItemComponent,
	MeetingInvitePanelComponent,
	MeetingToolbarLeaveButtonComponent,
	MeetingToolbarExtraButtonsComponent,
	MeetingSettingsExtensionsComponent,
	MeetingToolbarMoreOptionsMenuComponent
} from '@openvidu-meet/shared-components';

@Component({
	selector: 'app-ce-ov-meeting',
	imports: [
		MeetingComponent,
		MeetingToolbarLeaveButtonComponent,
		MeetingToolbarExtraButtonsComponent,
		MeetingInvitePanelComponent,
		MeetingParticipantItemComponent,
		MeetingCustomLayoutComponent,
		MeetingToolbarMoreOptionsMenuComponent,
		MeetingSettingsExtensionsComponent
	],
	templateUrl: './app-ce-meeting.component.html',
	styleUrl: './app-ce-meeting.component.scss'
})
export class AppCeMeetingComponent {}
