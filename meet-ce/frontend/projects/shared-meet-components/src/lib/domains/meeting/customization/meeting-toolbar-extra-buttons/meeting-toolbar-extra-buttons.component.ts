import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { LoggerService } from 'openvidu-components-angular';
import { MeetingCaptionsService } from '../../services/meeting-captions.service';
import { MeetingContextService } from '../../services/meeting-context.service';
import { MeetingService } from '../../services/meeting.service';

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
	protected captionService = inject(MeetingCaptionsService);
	protected log = this.loggerService.get('OpenVidu Meet - MeetingToolbarExtraButtons');
	protected readonly copyLinkTooltip = 'Copy the meeting link';
	protected readonly copyLinkText = 'Copy meeting link';

	/**
	 * Whether to show the copy link button
	 */
	protected showCopyLinkButton = computed(() => this.meetingContextService.canModerateRoom());

	/**
	 * Whether to show the captions button
	 */
	protected showCaptionsButton = computed(() => this.meetingContextService.areCaptionsAllowed());

	/**
	 * Whether the device is mobile (affects button style)
	 */
	protected isMobile = computed(() => this.meetingContextService.isMobile());

	protected areCaptionsEnabledByUser = computed(() => this.captionService.areCaptionsEnabledByUser());

	onCopyLinkClick(): void {
		const room = this.meetingContextService.meetRoom();
		if (!room) {
			this.log.e('Cannot copy link: meeting room is undefined');
			return;
		}

		this.meetingService.copyMeetingSpeakerLink(room);
	}

	onCaptionsClick(): void {
		this.captionService.areCaptionsEnabledByUser() ? this.captionService.disable() : this.captionService.enable();
	}
}
