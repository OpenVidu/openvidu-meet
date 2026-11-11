import { Component } from '@angular/core';
import { MeetingCustomLayoutComponent } from '../../customization/meeting-custom-layout/meeting-custom-layout.component';
import { MeetingInvitePanelComponent } from '../../customization/meeting-invite-panel/meeting-invite-panel.component';
import { MeetingParticipantItemComponent } from '../../customization/meeting-participant-item/meeting-participant-item.component';
import { MeetingParticipantsPanelActionsComponent } from '../../customization/meeting-participants-panel-actions/meeting-participants-panel-actions.component';
import { MeetingSettingsExtensionsComponent } from '../../customization/meeting-settings-extensions/meeting-settings-extensions.component';
import { MeetingToolbarExtraButtonsComponent } from '../../customization/meeting-toolbar-extra-buttons/meeting-toolbar-extra-buttons.component';
import { MeetingToolbarLeaveButtonComponent } from '../../customization/meeting-toolbar-leave-button/meeting-toolbar-leave-button.component';
import { MeetingToolbarMoreOptionsMenuComponent } from '../../customization/meeting-toolbar-more-options-menu/meeting-toolbar-more-options-menu.component';
import { WaitingRoomNoticeComponent } from '../../waiting-room/waiting-room-notice/waiting-room-notice.component';
import { WaitingRoomPanelSectionComponent } from '../../waiting-room/waiting-room-panel-section/waiting-room-panel-section.component';
import { WaitingRoomStatusChipComponent } from '../../waiting-room/waiting-room-status-chip/waiting-room-status-chip.component';
import { MeetingWaitingRoomComponent } from '../../waiting-room/meeting-waiting-room/meeting-waiting-room.component';
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
		MeetingWaitingRoomComponent,
		WaitingRoomPanelSectionComponent,
		WaitingRoomStatusChipComponent,
		WaitingRoomNoticeComponent
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
			<ov-meeting-waiting-room />
			<ov-waiting-room-panel-section />
			<ov-waiting-room-status-chip />
			<ov-waiting-room-notice />
		</ov-meeting>
	`,
	styles: ''
})
export class AppCeMeetingComponent {}
