import { Component, TemplateRef, ViewChild, inject } from '@angular/core';
import { ChangeDetectionStrategy } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MeetParticipantModerationAction, MeetRoomMemberUIBadge } from '@openvidu-meet/typings';
import { LoggerService, OpenViduComponentsUiModule } from 'openvidu-components-angular';
import { RoomMemberContextService } from '../../../room-members/services/room-member-context.service';
import { CustomParticipantModel, ParticipantDisplayProperties } from '../../models/custom-participant.model';
import { MeetingContextService } from '../../services/meeting-context.service';
import { MeetingService } from '../../services/meeting.service';

/**
 * Reusable component for displaying participant panel items with moderation controls.
 * This component receives context from the template (participant, localParticipant).
 */
@Component({
	selector: 'ov-meeting-participant-item',
	templateUrl: './meeting-participant-item.component.html',
	styleUrls: ['./meeting-participant-item.component.scss'],
	imports: [MatButtonModule, MatIconModule, MatTooltipModule, OpenViduComponentsUiModule],
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class MeetingParticipantItemComponent {
	// Template reference for the component's template
	@ViewChild('template', { static: true }) template!: TemplateRef<any>;

	protected meetingService = inject(MeetingService);
	protected meetingContextService = inject(MeetingContextService);
	protected roomMemberContextService = inject(RoomMemberContextService);
	protected loggerService = inject(LoggerService);
	protected log = this.loggerService.get('OpenVidu Meet - MeetingParticipantItem');

	/**
	 * Get or compute display properties for a participant
	 */
	getDisplayProperties(participant: CustomParticipantModel): ParticipantDisplayProperties {
		const hasBadge = participant.hasBadge();
		const displayProperties: ParticipantDisplayProperties = {
			showBadge: hasBadge,
			showModerationControls: false,
			showMakeModeratorButton: false,
			showUnmakeModeratorButton: false,
			showKickButton: false
		};

		// Moderation controls are only shown for remote participants
		// Skip if participant is local (current user)
		if (participant.isLocal) {
			return displayProperties;
		}

		const canMakeModerator = this.roomMemberContextService.hasPermission('canMakeModerator');
		const canKickParticipants = this.roomMemberContextService.hasPermission('canKickParticipants');

		// If user doesn't have any moderation permissions, no need to compute further
		if (!canMakeModerator && !canKickParticipants) {
			return displayProperties;
		}

		const isPromotedModerator = participant.isPromotedModerator();
		if (isPromotedModerator) {
			// Show unmake moderator and/or kick participant buttons if user has correct permission and
			// this participant is a promoted moderator (not an original moderator, who cannot be kicked or unmade moderator)
			displayProperties.showUnmakeModeratorButton = canMakeModerator;
			displayProperties.showKickButton = canKickParticipants;
		} else {
			// Show make moderator and/or kick participant buttons if user has correct permission
			// and this participant doesn't have any badge (is not owner/admin/moderator)
			displayProperties.showMakeModeratorButton = canMakeModerator && !hasBadge;
			displayProperties.showKickButton = canKickParticipants && !hasBadge;
		}

		// Show moderation controls container if any of the buttons should be shown
		displayProperties.showModerationControls =
			displayProperties.showMakeModeratorButton ||
			displayProperties.showUnmakeModeratorButton ||
			displayProperties.showKickButton;
		return displayProperties;
	}

	getParticipantBadgeIcon(participant: CustomParticipantModel): string {
		switch (participant.getBadge()) {
			case MeetRoomMemberUIBadge.OWNER:
				return 'crown'; // passkey or location_away
			case MeetRoomMemberUIBadge.ADMIN:
				return 'manage_accounts';
			case MeetRoomMemberUIBadge.MODERATOR:
				return 'shield_person';
			default:
				return '';
		}
	}

	getParticipantBadgeTooltip(participant: CustomParticipantModel): string {
		switch (participant.getBadge()) {
			case MeetRoomMemberUIBadge.OWNER:
				return 'Owner';
			case MeetRoomMemberUIBadge.ADMIN:
				return 'Admin';
			case MeetRoomMemberUIBadge.MODERATOR:
				return 'Moderator';
			default:
				return '';
		}
	}

	getParticipantBadgeClass(participant: CustomParticipantModel): string {
		switch (participant.getBadge()) {
			case MeetRoomMemberUIBadge.OWNER:
				return 'owner-badge';
			case MeetRoomMemberUIBadge.ADMIN:
				return 'admin-badge';
			case MeetRoomMemberUIBadge.MODERATOR:
				return 'moderator-badge';
			default:
				return '';
		}
	}

	async onMakeModeratorClick(participant: CustomParticipantModel): Promise<void> {
		if (!this.roomMemberContextService.hasPermission('canMakeModerator')) return;

		const roomId = this.meetingContextService.roomId();
		if (!roomId) {
			this.log.e('Cannot change participant role: room ID is undefined');
			return;
		}

		try {
			await this.meetingService.changeParticipantRole(
				roomId,
				participant.identity,
				MeetParticipantModerationAction.UPGRADE
			);
			this.log.d('Moderator assigned successfully');
		} catch (error) {
			this.log.e('Error assigning moderator:', error);
		}
	}

	async onUnmakeModeratorClick(participant: CustomParticipantModel): Promise<void> {
		if (!this.roomMemberContextService.hasPermission('canMakeModerator')) return;

		const roomId = this.meetingContextService.roomId();
		if (!roomId) {
			this.log.e('Cannot change participant role: room ID is undefined');
			return;
		}

		try {
			await this.meetingService.changeParticipantRole(
				roomId,
				participant.identity,
				MeetParticipantModerationAction.DOWNGRADE
			);
			this.log.d('Moderator unassigned successfully');
		} catch (error) {
			this.log.e('Error unassigning moderator:', error);
		}
	}

	async onKickParticipantClick(participant: CustomParticipantModel): Promise<void> {
		if (!this.roomMemberContextService.hasPermission('canKickParticipants')) return;

		const roomId = this.meetingContextService.roomId();
		if (!roomId) {
			this.log.e('Cannot kick participant: room ID is undefined');
			return;
		}

		try {
			await this.meetingService.kickParticipant(roomId, participant.identity);
			this.log.d('Participant kicked successfully');
		} catch (error) {
			this.log.e('Error kicking participant:', error);
		}
	}
}
