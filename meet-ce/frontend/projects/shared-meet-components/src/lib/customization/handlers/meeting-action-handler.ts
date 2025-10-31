import { InjectionToken } from '@angular/core';
import { CustomParticipantModel } from '../../models';

/**
 * Interface defining the controls to show for a participant in the participant panel.
 */
export interface ParticipantControls {
	/**
	 * Whether to show the moderator badge
	 */
	showModeratorBadge: boolean;

	/**
	 * Whether to show moderation controls (make/unmake moderator, kick)
	 */
	showModerationControls: boolean;

	/**
	 * Whether to show the "Make Moderator" button
	 */
	showMakeModerator: boolean;

	/**
	 * Whether to show the "Remove Moderator" button
	 */
	showUnmakeModerator: boolean;

	/**
	 * Whether to show the "Kick" button
	 */
	showKickButton: boolean;
}

/**
 * Abstract class defining the actions that can be performed in a meeting.
 * Apps (CE/PRO) must extend this class and provide their implementation.
 */
export abstract class MeetingActionHandler {
	/**
	 * Room ID - will be set by MeetingComponent
	 */
	roomId = '';

	/**
	 * Room secret - will be set by MeetingComponent
	 */
	roomSecret = '';

	/**
	 * Local participant - will be set by MeetingComponent
	 */
	localParticipant?: CustomParticipantModel;

	/**
	 * Kicks a participant from the meeting
	 */
	abstract kickParticipant(participant: CustomParticipantModel): Promise<void>;

	/**
	 * Makes a participant a moderator
	 */
	abstract makeModerator(participant: CustomParticipantModel): Promise<void>;

	/**
	 * Removes moderator role from a participant
	 */
	abstract unmakeModerator(participant: CustomParticipantModel): Promise<void>;

	/**
	 * Copies the moderator link to clipboard
	 */
	abstract copyModeratorLink(): Promise<void>;

	/**
	 * Copies the speaker link to clipboard
	 */
	abstract copySpeakerLink(): Promise<void>;

	/**
	 * Gets the controls to show for a participant based on permissions and roles
	 */
	abstract getParticipantControls(participant: CustomParticipantModel): ParticipantControls;
}

/**
 * Injection token for the meeting action handler.
 * Apps (CE/PRO) should provide their implementation using this token.
 */
export const MEETING_ACTION_HANDLER_TOKEN = new InjectionToken<MeetingActionHandler>('MEETING_ACTION_HANDLER_TOKEN');
