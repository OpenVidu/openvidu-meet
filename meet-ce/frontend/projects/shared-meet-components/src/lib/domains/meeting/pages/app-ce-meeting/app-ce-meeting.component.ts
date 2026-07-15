import { Component, inject, type OnInit } from '@angular/core';
import { IframeBridgeService } from '../../../embedded/services/iframe-bridge.service';
import { MeetingCustomLayoutComponent } from '../../customization/meeting-custom-layout/meeting-custom-layout.component';
import { MeetingInvitePanelComponent } from '../../customization/meeting-invite-panel/meeting-invite-panel.component';
import { MeetingParticipantItemComponent } from '../../customization/meeting-participant-item/meeting-participant-item.component';
import { MeetingSettingsExtensionsComponent } from '../../customization/meeting-settings-extensions/meeting-settings-extensions.component';
import { MeetingToolbarExtraButtonsComponent } from '../../customization/meeting-toolbar-extra-buttons/meeting-toolbar-extra-buttons.component';
import { MeetingToolbarLeaveButtonComponent } from '../../customization/meeting-toolbar-leave-button/meeting-toolbar-leave-button.component';
import { MeetingToolbarMoreOptionsMenuComponent } from '../../customization/meeting-toolbar-more-options-menu/meeting-toolbar-more-options-menu.component';
import { MeetingWaitingPanelComponent } from '../../customization/meeting-waiting-panel/meeting-waiting-panel.component';
import { MeetingComponent } from '../meeting/meeting.component';

@Component({
	selector: 'app-ce-ov-meeting',
	imports: [
		MeetingComponent,
		MeetingToolbarLeaveButtonComponent,
		MeetingToolbarExtraButtonsComponent,
		MeetingInvitePanelComponent,
		MeetingWaitingPanelComponent,
		MeetingParticipantItemComponent,
		MeetingCustomLayoutComponent,
		MeetingToolbarMoreOptionsMenuComponent,
		MeetingSettingsExtensionsComponent
	],
	template: `
		<ov-meeting>
			<ov-meeting-toolbar-leave-button />
			<ov-meeting-toolbar-extra-buttons />
			<ov-meeting-toolbar-more-options-menu />
			<ov-meeting-invite-panel />
			<ov-meeting-waiting-panel />
			<ov-meeting-participant-item />
			<ov-meeting-settings-extensions />
			<ov-meeting-custom-layout />
		</ov-meeting>
	`,
	styles: ''
})
export class AppCeMeetingComponent implements OnInit {
	private readonly iframeBridge = inject(IframeBridgeService);

	ngOnInit(): void {
		// Starts the postMessage bridge when embedded in an iframe; no-op otherwise.
		// Initialized here (lazy meeting entry) rather than at the app root so the embedded
		// command/bridge chain — and its LiveKit dependency — stays out of the eager `main` bundle.
		this.iframeBridge.initialize();
	}
}
