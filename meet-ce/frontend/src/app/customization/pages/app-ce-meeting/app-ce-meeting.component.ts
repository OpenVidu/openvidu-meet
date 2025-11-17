import { Component } from '@angular/core';
import {
	MeetingComponent,
	MeetingLayoutComponent,
	MeetingParticipantPanelItemComponent,
	MeetingShareLinkPanelComponent,
	MeetingToolbarButtonsComponent
} from '@openvidu-meet/shared-components';

@Component({
	selector: 'app-ce-ov-meeting',
	imports: [
		MeetingComponent,
		MeetingToolbarButtonsComponent,
		MeetingShareLinkPanelComponent,
		MeetingParticipantPanelItemComponent,
		MeetingLayoutComponent
	],
	templateUrl: './app-ce-meeting.component.html',
	styleUrl: './app-ce-meeting.component.scss'
})
export class AppCeMeetingComponent {}
