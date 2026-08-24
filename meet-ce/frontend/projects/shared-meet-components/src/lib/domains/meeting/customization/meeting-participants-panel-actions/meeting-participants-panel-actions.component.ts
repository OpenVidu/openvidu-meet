import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RoomMemberContextService } from '../../../room-members/services/room-member-context.service';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { MeetingContextService } from '../../services/meeting-context.service';
import { MeetingModerationService } from '../../services/meeting-moderation.service';
import { LoggerService } from '../../../../shared/services/logger.service';

/**
 * Panel-wide moderation actions for the participants panel header — currently just "mute all".
 */
@Component({
	selector: 'ov-meeting-participants-panel-actions',
	templateUrl: './meeting-participants-panel-actions.component.html',
	styleUrls: ['./meeting-participants-panel-actions.component.scss'],
	imports: [MatButtonModule, MatIconModule, MatTooltipModule, TranslatePipe]
})
export class MeetingParticipantsPanelActionsComponent {
	protected roomMemberContextService = inject(RoomMemberContextService);
	protected meetingContextService = inject(MeetingContextService);
	protected meetingModerationService = inject(MeetingModerationService);
	protected loggerService = inject(LoggerService);
	protected log = this.loggerService.get('OpenVidu Meet - MeetingParticipantsPanelActions');

	readonly canMuteAll = () => this.roomMemberContextService.hasPermission('participantMute');

	// Audio only: every meeting app's "mute all" targets the microphone, and force-closing cameras
	// or screen shares in bulk is not a pattern any of them offer.
	async onMuteAllClick(): Promise<void> {
		if (!this.canMuteAll()) return;

		const roomId = this.meetingContextService.roomId();

		if (!roomId) {
			this.log.e('Cannot mute every participant: room ID is undefined');
			return;
		}

		try {
			await this.meetingModerationService.muteAllParticipants(roomId, { audioActive: false });
			this.log.d('Muted every participant successfully');
		} catch (error) {
			this.log.e('Error muting every participant:', error);
		}
	}
}
