import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';

/**
 * Reusable component for meeting toolbar additional buttons.
 * This component is agnostic and can be configured via inputs.
 */
@Component({
	selector: 'ov-meeting-toolbar-buttons',
	templateUrl: './meeting-toolbar-buttons.component.html',
	styleUrls: ['./meeting-toolbar-buttons.component.scss'],
	imports: [CommonModule, MatButtonModule, MatIconModule, MatMenuModule, MatTooltipModule, MatDividerModule]
})
export class MeetingToolbarButtonsComponent {
	/**
	 * Whether to show the copy link button
	 */
	@Input() showCopyLinkButton = false;

	/**
	 * Whether to show the leave menu with options
	 */
	@Input() showLeaveMenu = false;

	/**
	 * Whether the device is mobile (affects button style)
	 */
	@Input() isMobile = false;

	/**
	 * Copy link button tooltip text
	 */
	@Input() copyLinkTooltip = 'Copy the meeting link';

	/**
	 * Copy link button text (for mobile)
	 */
	@Input() copyLinkText = 'Copy meeting link';

	/**
	 * Leave menu tooltip text
	 */
	@Input() leaveMenuTooltip = 'Leave options';

	/**
	 * Leave option text
	 */
	@Input() leaveOptionText = 'Leave meeting';

	/**
	 * End meeting option text
	 */
	@Input() endMeetingOptionText = 'End meeting for all';

	/**
	 * Emitted when the copy link button is clicked
	 */
	@Output() copyLinkClicked = new EventEmitter<void>();

	/**
	 * Emitted when the leave meeting option is clicked
	 */
	@Output() leaveMeetingClicked = new EventEmitter<void>();

	/**
	 * Emitted when the end meeting option is clicked
	 */
	@Output() endMeetingClicked = new EventEmitter<void>();

	/**
	 * Alternative to @Output: Function to call when copy link button is clicked
	 * When using NgComponentOutlet, use this instead of the @Output above
	 */
	@Input() copyLinkClickedFn?: () => void;

	/**
	 * Alternative to @Output: Function to call when leave meeting is clicked
	 * When using NgComponentOutlet, use this instead of the @Output above
	 */
	@Input() leaveMeetingClickedFn?: () => Promise<void>;

	/**
	 * Alternative to @Output: Function to call when end meeting is clicked
	 * When using NgComponentOutlet, use this instead of the @Output above
	 */
	@Input() endMeetingClickedFn?: () => Promise<void>;

	onCopyLinkClick(): void {
		if (this.copyLinkClickedFn) {
			this.copyLinkClickedFn();
		} else {
			this.copyLinkClicked.emit();
		}
	}

	async onLeaveMeetingClick(): Promise<void> {
		if (this.leaveMeetingClickedFn) {
			await this.leaveMeetingClickedFn();
		} else {
			this.leaveMeetingClicked.emit();
		}
	}

	async onEndMeetingClick(): Promise<void> {
		if (this.endMeetingClickedFn) {
			await this.endMeetingClickedFn();
		} else {
			this.endMeetingClicked.emit();
		}
	}
}
