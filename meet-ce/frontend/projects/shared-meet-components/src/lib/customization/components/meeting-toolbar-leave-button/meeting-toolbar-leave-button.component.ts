import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MeetingContextService } from '../../../services/meeting/meeting-context.service';
import { MeetingService } from '../../../services/meeting/meeting.service';
import { LoggerService, OpenViduService } from 'openvidu-components-angular';

/**
 * Reusable component for meeting toolbar Leave button.
 */
@Component({
	selector: 'ov-meeting-toolbar-leave-button',
	templateUrl: './meeting-toolbar-leave-button.component.html',
	styleUrls: ['./meeting-toolbar-leave-button.component.scss'],
	imports: [CommonModule, MatButtonModule, MatIconModule, MatMenuModule, MatTooltipModule, MatDividerModule]
})
export class MeetingToolbarLeaveButtonComponent {
	protected meetingContextService = inject(MeetingContextService);
	protected meetingService = inject(MeetingService);
	protected loggerService = inject(LoggerService);
	protected log = this.loggerService.get('OpenVidu Meet - MeetingToolbarLeaveButtons');
	protected openviduService = inject(OpenViduService);
	protected readonly leaveMenuTooltip = 'Leave options';
	protected readonly leaveOptionText = 'Leave meeting';
	protected readonly endMeetingOptionText = 'End meeting for all';

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
