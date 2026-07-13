import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { MeetingLiveKitService } from '../../openvidu-components';
import { MeetingContextService } from '../../services/meeting-context.service';
import { MeetingModerationService } from '../../services/meeting-moderation.service';
import { LoggerService } from '../../../../shared/services/logger.service';

/**
 * Reusable component for meeting toolbar Leave button.
 */
@Component({
	selector: 'ov-meeting-toolbar-leave-button',
	templateUrl: './meeting-toolbar-leave-button.component.html',
	styleUrls: ['./meeting-toolbar-leave-button.component.scss'],
	imports: [MatButtonModule, MatIconModule, MatMenuModule, MatTooltipModule, MatDividerModule, TranslatePipe],
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class MeetingToolbarLeaveButtonComponent {
	protected meetingContextService = inject(MeetingContextService);
	protected meetingModerationService = inject(MeetingModerationService);
	protected meetingLiveKitService = inject(MeetingLiveKitService);
	protected loggerService = inject(LoggerService);
	protected log = this.loggerService.get('OpenVidu Meet - MeetingToolbarLeaveButtons');

	showLeaveMenu = computed(() => this.meetingContextService.meetingUI().showEndMeeting);
	isMobile = this.meetingContextService.isMobile;

	async onLeaveMeetingClick(): Promise<void> {
		await this.meetingLiveKitService.disconnect();
	}

	async onEndMeetingClick(): Promise<void> {
		const roomId = this.meetingContextService.roomId();
		if (!roomId) {
			this.log.e('Cannot end meeting: room ID is undefined');
			return;
		}

		this.meetingContextService.setMeetingEndedBy('self');
		await this.meetingModerationService.endMeeting(roomId);
	}
}
