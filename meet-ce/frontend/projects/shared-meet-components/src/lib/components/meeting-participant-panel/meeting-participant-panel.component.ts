import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { OpenViduComponentsUiModule } from 'openvidu-components-angular';

/**
 * Reusable component for displaying participant panel items with moderation controls.
 * This component is agnostic and configurable via inputs.
 */
@Component({
	selector: 'ov-meeting-participant-panel',
	templateUrl: './meeting-participant-panel.component.html',
	styleUrls: ['./meeting-participant-panel.component.scss'],
	imports: [CommonModule, MatButtonModule, MatIconModule, MatTooltipModule, OpenViduComponentsUiModule]
})
export class MeetingParticipantPanelComponent {
	/**
	 * The participant to display
	 */
	@Input({ required: true }) participant: any;

	/**
	 * All participants in the meeting (used for determining moderation controls)
	 */
	@Input() allParticipants: any[] = [];

	/**
	 * Whether to show the moderator badge
	 */
	@Input() showModeratorBadge = false;

	/**
	 * Whether to show moderation controls (make/unmake moderator, kick)
	 */
	@Input() showModerationControls = false;

	/**
	 * Whether to show the "make moderator" button
	 */
	@Input() showMakeModerator = false;

	/**
	 * Whether to show the "unmake moderator" button
	 */
	@Input() showUnmakeModerator = false;

	/**
	 * Whether to show the "kick participant" button
	 */
	@Input() showKickButton = false;

	/**
	 * Moderator badge tooltip text
	 */
	@Input() moderatorBadgeTooltip = 'Moderator';

	/**
	 * Make moderator button tooltip text
	 */
	@Input() makeModeratorTooltip = 'Make participant moderator';

	/**
	 * Unmake moderator button tooltip text
	 */
	@Input() unmakeModeratorTooltip = 'Unmake participant moderator';

	/**
	 * Kick participant button tooltip text
	 */
	@Input() kickParticipantTooltip = 'Kick participant';

	/**
	 * Emitted when the make moderator button is clicked
	 */
	@Output() makeModeratorClicked = new EventEmitter<any>();

	/**
	 * Emitted when the unmake moderator button is clicked
	 */
	@Output() unmakeModeratorClicked = new EventEmitter<any>();

	/**
	 * Emitted when the kick participant button is clicked
	 */
	@Output() kickParticipantClicked = new EventEmitter<any>();

	/**
	 * Alternative to @Output: Function to call when make moderator is clicked
	 * When using NgComponentOutlet, use this instead of the @Output above
	 */
	@Input() makeModeratorClickedFn?: () => void;

	/**
	 * Alternative to @Output: Function to call when unmake moderator is clicked
	 */
	@Input() unmakeModeratorClickedFn?: () => void;

	/**
	 * Alternative to @Output: Function to call when kick participant is clicked
	 */
	@Input() kickParticipantClickedFn?: () => void;

	onMakeModeratorClick(): void {
		if (this.makeModeratorClickedFn) {
			this.makeModeratorClickedFn();
		} else {
			this.makeModeratorClicked.emit(this.participant);
		}
	}

	onUnmakeModeratorClick(): void {
		if (this.unmakeModeratorClickedFn) {
			this.unmakeModeratorClickedFn();
		} else {
			this.unmakeModeratorClicked.emit(this.participant);
		}
	}

	onKickParticipantClick(): void {
		if (this.kickParticipantClickedFn) {
			this.kickParticipantClickedFn();
		} else {
			this.kickParticipantClicked.emit(this.participant);
		}
	}
}
