import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { ChangeDetectionStrategy } from '@angular/core';
import { LoggerService } from 'openvidu-components-angular';
import { ShareMeetingLinkComponent } from '../../components/share-meeting-link/share-meeting-link.component';
import { MeetingAccessLinkService } from '../../services/meeting-access-link.service';
import { MeetingContextService } from '../../services/meeting-context.service';

/**
 * Reusable component for displaying the share meeting link panel
 * inside the participants panel.
 */
@Component({
	selector: 'ov-meeting-invite-panel',
	templateUrl: './meeting-invite-panel.component.html',
	styleUrls: ['./meeting-invite-panel.component.scss'],
	imports: [CommonModule, ShareMeetingLinkComponent],
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class MeetingInvitePanelComponent {
	protected meetingContextService = inject(MeetingContextService);
	protected meetingAccessLinkService = inject(MeetingAccessLinkService);

	showShareLink = computed(() => this.meetingContextService.meetingUI().showShareAccessLinks);
	meetingUrl = this.meetingAccessLinkService.speakerPublicLink;

	onCopyClicked(): void {
		this.meetingAccessLinkService.copyMeetingSpeakerLink();
	}
}
