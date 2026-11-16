import { Component } from '@angular/core';
import { MeetingCustomLayoutComponent } from '../../customization/meeting-custom-layout/meeting-custom-layout.component';
import { MeetingInvitePanelComponent } from '../../customization/meeting-invite-panel/meeting-invite-panel.component';
import { MeetingParticipantItemComponent } from '../../customization/meeting-participant-item/meeting-participant-item.component';
import { MeetingParticipantsPanelActionsComponent } from '../../customization/meeting-participants-panel-actions/meeting-participants-panel-actions.component';
import { MeetingSettingsExtensionsComponent } from '../../customization/meeting-settings-extensions/meeting-settings-extensions.component';
import { MeetingToolbarExtraButtonsComponent } from '../../customization/meeting-toolbar-extra-buttons/meeting-toolbar-extra-buttons.component';
import { MeetingToolbarLeaveButtonComponent } from '../../customization/meeting-toolbar-leave-button/meeting-toolbar-leave-button.component';
import { MeetingToolbarMoreOptionsMenuComponent } from '../../customization/meeting-toolbar-more-options-menu/meeting-toolbar-more-options-menu.component';
import { WaitingParticipantsNoticeComponent } from '../../waiting-participants/waiting-participants-notice/waiting-participants-notice.component';
import { WaitingParticipantsPanelSectionComponent } from '../../waiting-participants/waiting-participants-panel-section/waiting-participants-panel-section.component';
import { WaitingParticipantsStatusChipComponent } from '../../waiting-participants/waiting-participants-status-chip/waiting-participants-status-chip.component';
import { MeetingWaitingScreensComponent } from '../../waiting-participants/meeting-waiting-screens/meeting-waiting-screens.component';
import { MeetingComponent } from '../meeting/meeting.component';

@Component({
	selector: 'app-ce-ov-meeting',
	imports: [
		MeetingComponent,
		MeetingToolbarLeaveButtonComponent,
		MeetingToolbarExtraButtonsComponent,
		MeetingInvitePanelComponent,
		MeetingParticipantItemComponent,
		MeetingParticipantsPanelActionsComponent,
		MeetingCustomLayoutComponent,
		MeetingToolbarMoreOptionsMenuComponent,
		MeetingSettingsExtensionsComponent,
		MeetingWaitingScreensComponent,
		WaitingParticipantsPanelSectionComponent,
		WaitingParticipantsStatusChipComponent,
		WaitingParticipantsNoticeComponent
	],
	template: `
		<ov-meeting>
			<ov-meeting-toolbar-leave-button />
			<ov-meeting-toolbar-extra-buttons />
			<ov-meeting-toolbar-more-options-menu />
			<ov-meeting-invite-panel />
			<ov-meeting-participant-item />
			<ov-meeting-participants-panel-actions />
			<ov-meeting-settings-extensions />
			<ov-meeting-custom-layout />
			<ov-meeting-waiting-screens />
			<ov-waiting-participants-panel-section />
			<ov-waiting-participants-status-chip />
			<ov-waiting-participants-notice />
		</ov-meeting>
	`,
	styles: ''
})
export class AppCeMeetingComponent {}
