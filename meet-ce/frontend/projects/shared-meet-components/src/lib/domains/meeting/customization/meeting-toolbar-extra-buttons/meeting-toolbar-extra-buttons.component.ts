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
	protected captionService = inject(MeetingCaptionsService);
	protected loggerService = inject(LoggerService);
	protected log = this.loggerService.get('OpenVidu Meet - MeetingToolbarExtraButtons');

	/** Whether to show the copy link button (only for moderators) */
	showCopyLinkButton = this.meetingContextService.canModerateRoom;
	copyLinkTooltip = 'Copy the meeting link';
	copyLinkText = 'Copy meeting link';

	/** Captions status based on room and global configuration */
	captionsStatus = this.meetingContextService.getCaptionsStatus;
	/** Whether to show the captions button (visible when not HIDDEN) */
	showCaptionsButton = computed(() => this.captionsStatus() !== 'HIDDEN');
	/** Whether captions button is disabled (true when DISABLED_WITH_WARNING) */
	isCaptionsButtonDisabled = computed(() => this.captionsStatus() === 'DISABLED_WITH_WARNING');
	/** Whether captions are currently enabled by the user */
	areCaptionsEnabledByUser = this.captionService.areCaptionsEnabledByUser;

	/** Whether the device is mobile (affects button style) */
	isMobile = this.meetingContextService.isMobile;

	onCopyLinkClick(): void {
		const room = this.meetingContextService.meetRoom();
		if (!room) {
			this.log.e('Cannot copy link: meeting room is undefined');
			return;
		}

		this.meetingService.copyMeetingSpeakerLink(room);
	}

	onCaptionsClick(): void {
		// Don't allow toggling if captions are disabled at system level
		if (this.isCaptionsButtonDisabled()) {
			this.log.w('Captions are disabled at system level (MEET_CAPTIONS_ENABLED=false)');
			return;
		}
		this.areCaptionsEnabledByUser() ? this.captionService.disable() : this.captionService.enable();
	}
}
