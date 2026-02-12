import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { LoggerService, OpenViduService } from 'openvidu-components-angular';
import { MeetingContextService } from '../../services/meeting-context.service';
import { MeetingService } from '../../services/meeting.service';

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
	protected openviduService = inject(OpenViduService);
	protected loggerService = inject(LoggerService);
	protected log = this.loggerService.get('OpenVidu Meet - MeetingToolbarLeaveButtons');

	showLeaveMenu = this.meetingContextService.canModerateRoom;
	isMobile = this.meetingContextService.isMobile;

	leaveMenuTooltip = 'Leave options';
	leaveOptionText = 'Leave meeting';
	endMeetingOptionText = 'End meeting for all';

	async onLeaveMeetingClick(): Promise<void> {
		await this.openviduService.disconnectRoom();
	}

	async onEndMeetingClick(): Promise<void> {
		const roomId = this.meetingContextService.roomId();
		if (!roomId) {
			this.log.e('Cannot end meeting: room ID is undefined');
			return;
		}

		this.meetingContextService.setMeetingEndedBy('self');
		await this.meetingService.endMeeting(roomId);
	}
}
