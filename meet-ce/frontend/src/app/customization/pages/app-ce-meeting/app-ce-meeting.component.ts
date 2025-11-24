import { Component } from '@angular/core';
import {
	MeetingComponent,
	MeetingLayoutComponent,
	MeetingParticipantPanelItemComponent,
	MeetingShareLinkPanelComponent,
	MeetingToolbarButtonsComponent,
	MeetingSettingsPanelComponent,
	MeetingToolbarMoreOptionsButtonsComponent
} from '@openvidu-meet/shared-components';

@Component({
	selector: 'app-ce-ov-meeting',
	imports: [
		MeetingComponent,
		MeetingToolbarButtonsComponent,
		MeetingShareLinkPanelComponent,
		MeetingParticipantPanelItemComponent,
		MeetingLayoutComponent,
		MeetingToolbarMoreOptionsButtonsComponent,
		MeetingSettingsPanelComponent
	],
	templateUrl: './app-ce-meeting.component.html',
	styleUrl: './app-ce-meeting.component.scss'
})
export class AppCeMeetingComponent {}
