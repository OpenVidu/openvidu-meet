import { CommonModule } from '@angular/common';
import { Component, TemplateRef, ViewChild, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { LoggerService, OpenViduComponentsUiModule } from 'openvidu-components-angular';
import { CustomParticipantModel } from '../../../models';
import { MeetingService } from '../../../services/meeting/meeting.service';
import { MeetRoomMemberRole } from '@openvidu-meet/typings';

/**
 * Interface for computed participant display properties
 */
export interface ParticipantDisplayProperties {
	showModeratorBadge: boolean;
	showModerationControls: boolean;
	showMakeModeratorButton: boolean;
	showUnmakeModeratorButton: boolean;
	showKickButton: boolean;
}

/**
 * Reusable component for displaying participant panel items with moderation controls.
 * This component receives context from the template (participant, localParticipant).
 */
@Component({
	selector: 'ov-meeting-participant-item',
	templateUrl: './meeting-participant-item.component.html',
	styleUrls: ['./meeting-participant-item.component.scss'],
	imports: [CommonModule, MatButtonModule, MatIconModule, MatTooltipModule, OpenViduComponentsUiModule]
})
export class MeetingParticipantItemComponent {
	// Template reference for the component's template
	@ViewChild('template', { static: true }) template!: TemplateRef<any>;

	protected meetingService: MeetingService = inject(MeetingService);
	protected loggerService = inject(LoggerService);
	protected log = this.loggerService.get('OpenVidu Meet - MeetingParticipantItem');

	// Tooltips (could be made configurable in the future if needed)
	protected readonly moderatorBadgeTooltip = 'Moderator';
	protected readonly makeModeratorTooltip = 'Make participant moderator';
	protected readonly unmakeModeratorTooltip = 'Unmake participant moderator';
	protected readonly kickParticipantTooltip = 'Kick participant';

	/**
	 * Get or compute display properties for a participant
	 */
	protected getDisplayProperties(
		participant: CustomParticipantModel,
		localParticipant: CustomParticipantModel
	): ParticipantDisplayProperties {
		// Compute all display properties once
		const isLocalModerator = localParticipant.isModerator();
		const isParticipantLocal = participant.isLocal;
		const isParticipantModerator = participant.isModerator();
		const isParticipantOriginalModerator = participant.isOriginalModerator();

		return {
			showModeratorBadge: isParticipantModerator,
			showModerationControls: isLocalModerator && !isParticipantLocal,
			showMakeModeratorButton: isLocalModerator && !isParticipantLocal && !isParticipantModerator,
			showUnmakeModeratorButton:
				isLocalModerator && !isParticipantLocal && isParticipantModerator && !isParticipantOriginalModerator,
			showKickButton: isLocalModerator && !isParticipantLocal && !isParticipantOriginalModerator
		};
	}

	async onMakeModeratorClick(
		participantContext: CustomParticipantModel,
		localParticipant: CustomParticipantModel
	): Promise<void> {
		if (!localParticipant.isModerator()) return;

		const roomId = localParticipant.roomName;

		if (!roomId) {
			this.log.e('Cannot change participant role: local participant room name is undefined');
			return;
		}

		try {
			await this.meetingService.changeParticipantRole(
				roomId,
				participantContext.identity,
				MeetRoomMemberRole.MODERATOR
			);
			this.log.d('Moderator assigned successfully');
		} catch (error) {
			this.log.e('Error assigning moderator:', error);
		}
	}

	async onUnmakeModeratorClick(
		participantContext: CustomParticipantModel,
		localParticipant: CustomParticipantModel
	): Promise<void> {
		if (!localParticipant.isModerator()) return;

		const roomId = localParticipant.roomName;

		if (!roomId) {
			this.log.e('Cannot change participant role: local participant room name is undefined');
			return;
		}

		try {
			await this.meetingService.changeParticipantRole(
				roomId,
				participantContext.identity,
				MeetRoomMemberRole.SPEAKER
			);
			this.log.d('Moderator unassigned successfully');
		} catch (error) {
			this.log.e('Error unassigning moderator:', error);
		}
	}

	async onKickParticipantClick(
		participantContext: CustomParticipantModel,
		localParticipant: CustomParticipantModel
	): Promise<void> {
		if (!localParticipant.isModerator()) return;

		const roomId = localParticipant.roomName;

		if (!roomId) {
			this.log.e('Cannot change participant role: local participant room name is undefined');
			return;
		}

		try {
			await this.meetingService.kickParticipant(roomId, participantContext.identity);
			this.log.d('Participant kicked successfully');
		} catch (error) {
			this.log.e('Error kicking participant:', error);
		}
	}
}
