import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { ShareMeetingLinkComponent } from '../../../components/share-meeting-link/share-meeting-link.component';
import { MeetingContextService } from '../../../services/meeting/meeting-context.service';
import { MeetingService } from '../../../services/meeting/meeting.service';
import { LoggerService } from 'openvidu-components-angular';

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

	/**
	 * Computed signal to determine if the share link should be shown
	 */
	protected showShareLink = computed(() => {
		return this.meetingContextService.canModerateRoom();
	});

	/**
	 * Computed signal for the meeting URL from context
	 */
	protected meetingUrl = computed(() => {
		return this.meetingContextService.meetingUrl();
	});

	onCopyClicked(): void {
		const room = this.meetingContextService.meetRoom();
		if (!room) {
			this.log.e('Cannot copy link: meeting room is undefined');
			return;
		}

		this.meetingService.copyMeetingSpeakerLink(room);
	}
}
