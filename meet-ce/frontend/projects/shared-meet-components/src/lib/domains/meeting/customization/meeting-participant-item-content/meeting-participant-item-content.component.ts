import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MeetParticipantModerationAction } from '@openvidu-meet/typings';
import { RoomMemberContextService } from '../../../room-members/services/room-member-context.service';
import { RoomMemberUiUtils } from '../../../room-members/utils/ui';
import { OpenViduComponentsUiModule, ParticipantDisplayProperties, ParticipantModel } from '../../openvidu-components';
import { MeetingContextService } from '../../services/meeting-context.service';
import { MeetingModerationService } from '../../services/meeting-moderation.service';
import { LoggerService } from '../../../../shared/services/logger.service';

/**
 * Renders a single participant panel item — the role badge and the moderation controls
 * (make/unmake moderator, kick) — for one participant.
 */
@Component({
	selector: 'ov-meeting-participant-item-content',
	templateUrl: './meeting-participant-item-content.component.html',
	styleUrls: ['./meeting-participant-item-content.component.scss'],
	imports: [MatButtonModule, MatIconModule, MatTooltipModule, OpenViduComponentsUiModule],
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class MeetingParticipantItemContentComponent {
	readonly participant = input.required<ParticipantModel>();

	protected meetingModerationService = inject(MeetingModerationService);
	protected meetingContextService = inject(MeetingContextService);
	protected roomMemberContextService = inject(RoomMemberContextService);
	protected loggerService = inject(LoggerService);
	protected log = this.loggerService.get('OpenVidu Meet - MeetingParticipantItemContent');

	protected readonly RoomMemberUiUtils = RoomMemberUiUtils;

	/**
	 * Reactive display properties for this participant. Reads the participant's signal-backed
	 * moderation state (badge, promotedModerator) and the signal-backed room member permissions,
	 * so it recomputes automatically and only when a real dependency changes.
	 */
	readonly displayProperties = computed<ParticipantDisplayProperties>(() => {
		const participant = this.participant();
		const hasBadge = participant.hasBadge();
		const displayProperties: ParticipantDisplayProperties = {
			showBadge: hasBadge,
			showModerationControls: false,
			showMakeModeratorButton: false,
			showUnmakeModeratorButton: false,
			showKickButton: false
		};

		// Moderation controls are only shown for remote participants, never for the current user.
		if (participant.isLocal) {
			return displayProperties;
		}

		const canMakeModerator = this.roomMemberContextService.hasPermission('canMakeModerator');
		const canKickParticipants = this.roomMemberContextService.hasPermission('canKickParticipants');

		// If the user doesn't have any moderation permissions, no need to compute further.
		if (!canMakeModerator && !canKickParticipants) {
			return displayProperties;
		}

		if (participant.isPromotedModerator()) {
			// Show unmake-moderator and/or kick buttons if the user has the permission and this
			// participant is a promoted moderator (an original moderator cannot be kicked or demoted).
			displayProperties.showUnmakeModeratorButton = canMakeModerator;
			displayProperties.showKickButton = canKickParticipants;
		} else {
			// Show make-moderator and/or kick buttons if the user has the permission and this
			// participant doesn't have any badge (is not owner/admin/moderator).
			displayProperties.showMakeModeratorButton = canMakeModerator && !hasBadge;
			displayProperties.showKickButton = canKickParticipants && !hasBadge;
		}

		// Show the moderation controls container if any of the buttons should be shown.
		displayProperties.showModerationControls =
			displayProperties.showMakeModeratorButton ||
			displayProperties.showUnmakeModeratorButton ||
			displayProperties.showKickButton;
		return displayProperties;
	});

	async onMakeModeratorClick(): Promise<void> {
		if (!this.roomMemberContextService.hasPermission('canMakeModerator')) return;

		const roomId = this.meetingContextService.roomId();
		if (!roomId) {
			this.log.e('Cannot change participant role: room ID is undefined');
			return;
		}

		try {
			await this.meetingModerationService.changeParticipantRole(
				roomId,
				this.participant().identity,
				MeetParticipantModerationAction.UPGRADE
			);
			this.log.d('Moderator assigned successfully');
		} catch (error) {
			this.log.e('Error assigning moderator:', error);
		}
	}

	async onUnmakeModeratorClick(): Promise<void> {
		if (!this.roomMemberContextService.hasPermission('canMakeModerator')) return;

		const roomId = this.meetingContextService.roomId();
		if (!roomId) {
			this.log.e('Cannot change participant role: room ID is undefined');
			return;
		}

		try {
			await this.meetingModerationService.changeParticipantRole(
				roomId,
				this.participant().identity,
				MeetParticipantModerationAction.DOWNGRADE
			);
			this.log.d('Moderator unassigned successfully');
		} catch (error) {
			this.log.e('Error unassigning moderator:', error);
		}
	}

	async onKickParticipantClick(): Promise<void> {
		if (!this.roomMemberContextService.hasPermission('canKickParticipants')) return;

		const roomId = this.meetingContextService.roomId();
		if (!roomId) {
			this.log.e('Cannot kick participant: room ID is undefined');
			return;
		}

		try {
			await this.meetingModerationService.kickParticipant(roomId, this.participant().identity);
			this.log.d('Participant kicked successfully');
		} catch (error) {
			this.log.e('Error kicking participant:', error);
		}
	}
}
