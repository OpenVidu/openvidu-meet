import { Component } from '@angular/core';
import {
	MeetingComponent,
	MeetingCustomLayoutComponent,
	MeetingInvitePanelComponent,
	MeetingParticipantItemComponent,
	MeetingSettingsExtensionsComponent,
	MeetingToolbarExtraButtonsComponent,
	MeetingToolbarLeaveButtonComponent,
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
	template: `
		<ov-meeting>
			<ov-meeting-toolbar-leave-button></ov-meeting-toolbar-leave-button>
			<ov-meeting-toolbar-extra-buttons></ov-meeting-toolbar-extra-buttons>
			<ov-meeting-toolbar-more-options-menu></ov-meeting-toolbar-more-options-menu>
			<ov-meeting-invite-panel></ov-meeting-invite-panel>
			<ov-meeting-participant-item></ov-meeting-participant-item>
			<ov-meeting-settings-extensions></ov-meeting-settings-extensions>
			<ov-meeting-custom-layout></ov-meeting-custom-layout>
		</ov-meeting>
	`,
	styles: ''
})
export class AppCeMeetingComponent {}
