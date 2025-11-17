import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MeetingContextService } from '../../../services/meeting/meeting-context.service';
import { MeetingService } from '../../../services/meeting/meeting.service';
import { LoggerService, OpenViduService, ViewportService } from 'openvidu-components-angular';

/**
 * Reusable component for meeting toolbar additional buttons.
 */
@Component({
	selector: 'ov-meeting-toolbar-buttons',
	templateUrl: './meeting-toolbar-buttons.component.html',
	styleUrls: ['./meeting-toolbar-buttons.component.scss'],
	imports: [CommonModule, MatButtonModule, MatIconModule, MatMenuModule, MatTooltipModule, MatDividerModule]
})
export class MeetingToolbarButtonsComponent {
	protected meetingContextService = inject(MeetingContextService);
	protected meetingService = inject(MeetingService);
	protected loggerService = inject(LoggerService);
	protected log = this.loggerService.get('OpenVidu Meet - MeetingToolbarButtons');
	protected openviduService = inject(OpenViduService);
	protected readonly copyLinkTooltip = 'Copy the meeting link';
	protected readonly copyLinkText = 'Copy meeting link';
	protected readonly leaveMenuTooltip = 'Leave options';
	protected readonly leaveOptionText = 'Leave meeting';
	protected readonly endMeetingOptionText = 'End meeting for all';

	/**
	 * Whether to show the copy link button
	 */
	protected showCopyLinkButton = computed(() => {
		return this.meetingContextService.canModerateRoom();
	});

	/**
	 * Whether to show the leave menu with options
	 */
	protected showLeaveMenu = computed(() => {
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

	async onLeaveMeetingClick(): Promise<void> {
		await this.openviduService.disconnectRoom();
	}

	async onEndMeetingClick(): Promise<void> {
		const roomId = this.meetingContextService.roomId();
		if (!roomId) {
			this.log.e('Cannot end meeting: room ID is undefined');
			return;
		}

		await this.meetingService.endMeeting(roomId);
	}
}
