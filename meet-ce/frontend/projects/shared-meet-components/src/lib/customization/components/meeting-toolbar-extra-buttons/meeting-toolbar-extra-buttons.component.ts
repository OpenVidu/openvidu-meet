import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatMenuModule } from '@angular/material/menu';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MeetingContextService } from '../../../services/meeting/meeting-context.service';
import { MeetingService } from '../../../services/meeting/meeting.service';
import { LoggerService } from 'openvidu-components-angular';

/**
 * Component for extra toolbar buttons (like copy meeting link).
 * These buttons can appear inside the "More Options" menu on mobile.
 */
@Component({
	selector: 'ov-meeting-toolbar-extra-buttons',
	templateUrl: './meeting-toolbar-extra-buttons.component.html',
	styleUrls: ['./meeting-toolbar-extra-buttons.component.scss'],
	imports: [CommonModule, MatButtonModule, MatIconModule, MatMenuModule, MatTooltipModule]
})
export class MeetingToolbarExtraButtonsComponent {
	protected meetingContextService = inject(MeetingContextService);
	protected meetingService = inject(MeetingService);
	protected loggerService = inject(LoggerService);
	protected log = this.loggerService.get('OpenVidu Meet - MeetingToolbarExtraButtons');
	protected readonly copyLinkTooltip = 'Copy the meeting link';
	protected readonly copyLinkText = 'Copy meeting link';

	/**
	 * Whether to show the copy link button
	 */
	protected showCopyLinkButton = computed(() => {
		return this.meetingContextService.canModerateRoom();
	});

	/**
	 * Whether the device is mobile (affects button style)
	 */
	protected isMobile = computed(() => {
		return this.meetingContextService.isMobile();
	});

	onCopyLinkClick(): void {
		const room = this.meetingContextService.meetRoom();
		if (!room) {
			this.log.e('Cannot copy link: meeting room is undefined');
			return;
		}

		this.meetingService.copyMeetingSpeakerLink(room);
	}
}
