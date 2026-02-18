import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { LoggerService } from 'openvidu-components-angular';
import { ShareMeetingLinkComponent } from '../../components/share-meeting-link/share-meeting-link.component';
import { MeetingContextService } from '../../services/meeting-context.service';
import { MeetingService } from '../../services/meeting.service';

/**
 * Reusable component for displaying the share meeting link panel
 * inside the participants panel.
 */
@Component({
	selector: 'ov-meeting-invite-panel',
	templateUrl: './meeting-invite-panel.component.html',
	styleUrls: ['./meeting-invite-panel.component.scss'],
	imports: [CommonModule, ShareMeetingLinkComponent]
})
export class MeetingInvitePanelComponent {
	protected meetingContextService = inject(MeetingContextService);
	protected meetingService = inject(MeetingService);
	protected loggerService = inject(LoggerService);
	protected log = this.loggerService.get('OpenVidu Meet - MeetingInvitePanel');

	showShareLink = computed(() => this.meetingContextService.meetingUI().showShareAccessLinks);
	meetingUrl = this.meetingContextService.meetingUrl;

	onCopyClicked(): void {
		const room = this.meetingContextService.meetRoom();
		if (!room) {
			this.log.e('Cannot copy link: meeting room is undefined');
			return;
		}

		this.meetingService.copyMeetingSpeakerLink(room);
	}
}
