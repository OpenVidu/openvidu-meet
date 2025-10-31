import { Injectable, Optional, Inject } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { CustomParticipantModel } from '../../models';
import { MeetingActionHandler, MEETING_ACTION_HANDLER_TOKEN, ParticipantControls } from '../../customization';
import { ParticipantService } from '../participant.service';

/**
 * Service that manages plugin inputs and configurations for the MeetingComponent.
 *
 * Responsibilities:
 * - Prepare input objects for toolbar plugins
 * - Prepare input objects for participant panel plugins
 * - Prepare input objects for layout plugins
 * - Prepare input objects for lobby plugin
 * - Calculate participant control visibility based on roles and permissions
 *
 * This service acts as a bridge between the MeetingComponent and the plugin components,
 * encapsulating the logic for determining what inputs each plugin should receive.
 */
@Injectable()
export class MeetingPluginManagerService {
	constructor(
		private participantService: ParticipantService,
		@Optional() @Inject(MEETING_ACTION_HANDLER_TOKEN) private actionHandler?: MeetingActionHandler
	) {}

	/**
	 * Prepares inputs for the toolbar additional buttons plugin
	 */
	getToolbarAdditionalButtonsInputs(
		canModerateRoom: boolean,
		isMobile: boolean,
		onCopyLink: () => void
	) {
		return {
			showCopyLinkButton: canModerateRoom,
			showLeaveMenu: false,
			isMobile,
			copyLinkClickedFn: onCopyLink
		};
	}

	/**
	 * Prepares inputs for the toolbar leave button plugin
	 */
	getToolbarLeaveButtonInputs(
		canModerateRoom: boolean,
		isMobile: boolean,
		onLeave: () => Promise<void>,
		onEnd: () => Promise<void>
	) {
		return {
			showCopyLinkButton: false,
			showLeaveMenu: canModerateRoom,
			isMobile,
			leaveMeetingClickedFn: onLeave,
			endMeetingClickedFn: onEnd
		};
	}

	/**
	 * Prepares inputs for the participant panel "after local participant" plugin
	 */
	getParticipantPanelAfterLocalInputs(
		canModerateRoom: boolean,
		meetingUrl: string,
		onCopyLink: () => void
	) {
		return {
			showShareLink: canModerateRoom,
			meetingUrl,
			copyClickedFn: onCopyLink
		};
	}

	/**
	 * Prepares inputs for the layout additional elements plugin
	 */
	getLayoutAdditionalElementsInputs(
		showOverlay: boolean,
		meetingUrl: string,
		onCopyLink: () => void
	) {
		return {
			showOverlay,
			meetingUrl,
			copyClickedFn: onCopyLink
		};
	}

	/**
	 * Prepares inputs for the participant panel item plugin
	 */
	getParticipantPanelItemInputs(
		participant: CustomParticipantModel,
		allParticipants: CustomParticipantModel[],
		onMakeModerator: (p: CustomParticipantModel) => void,
		onUnmakeModerator: (p: CustomParticipantModel) => void,
		onKick: (p: CustomParticipantModel) => void
	) {
		const controls = this.getParticipantControls(participant);

		return {
			participant,
			allParticipants,
			showModeratorBadge: controls.showModeratorBadge,
			showModerationControls: controls.showModerationControls,
			showMakeModerator: controls.showMakeModerator,
			showUnmakeModerator: controls.showUnmakeModerator,
			showKickButton: controls.showKickButton,
			makeModeratorClickedFn: () => onMakeModerator(participant),
			unmakeModeratorClickedFn: () => onUnmakeModerator(participant),
			kickParticipantClickedFn: () => onKick(participant)
		};
	}

	/**
	 * Prepares inputs for the lobby plugin
	 */
	getLobbyInputs(
		roomName: string,
		meetingUrl: string,
		roomClosed: boolean,
		showRecordingCard: boolean,
		showShareLink: boolean,
		showBackButton: boolean,
		backButtonText: string,
		participantForm: FormGroup,
		onFormSubmit: () => void,
		onViewRecordings: () => void,
		onBack: () => void,
		onCopyLink: () => void
	) {
		return {
			roomName,
			meetingUrl,
			roomClosed,
			showRecordingsCard: showRecordingCard,
			showShareLink,
			showBackButton,
			backButtonText,
			participantForm,
			formSubmittedFn: onFormSubmit,
			viewRecordingsClickedFn: onViewRecordings,
			backClickedFn: onBack,
			copyLinkClickedFn: onCopyLink
		};
	}

	/**
	 * Gets participant controls based on action handler or default logic
	 */
	private getParticipantControls(participant: CustomParticipantModel): ParticipantControls {
		if (this.actionHandler) {
			return this.actionHandler.getParticipantControls(participant);
		}

		// Default implementation
		return this.getDefaultParticipantControls(participant);
	}

	/**
	 * Default implementation for calculating participant control visibility.
	 *
	 * Rules:
	 * - Only moderators can see moderation controls
	 * - Local participant never sees controls on themselves
	 * - A moderator who was promoted (not original) cannot remove the moderator role from original moderators
	 * - A moderator who was promoted (not original) cannot kick original moderators
	 * - The moderator badge is shown based on the current role, not original role
	 */
	protected getDefaultParticipantControls(participant: CustomParticipantModel): ParticipantControls {
		const isCurrentUser = participant.isLocal;
		const currentUserIsModerator = this.participantService.isModeratorParticipant();
		const participantIsModerator = participant.isModerator();
		const participantIsOriginalModerator = participant.isOriginalModerator();

		// Calculate if current moderator can revoke the moderator role from the target participant
		// Only allow if target is not an original moderator
		const canRevokeModeratorRole = currentUserIsModerator && !isCurrentUser && participantIsModerator && !participantIsOriginalModerator;

		// Calculate if current moderator can kick the target participant
		// Only allow if target is not an original moderator
		const canKickParticipant = currentUserIsModerator && !isCurrentUser && !participantIsOriginalModerator;

		return {
			showModeratorBadge: participantIsModerator,
			showModerationControls: currentUserIsModerator && !isCurrentUser,
			showMakeModerator: currentUserIsModerator && !isCurrentUser && !participantIsModerator,
			showUnmakeModerator: canRevokeModeratorRole,
			showKickButton: canKickParticipant
		};
	}
}
