import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ShareMeetingLinkComponent } from '../share-meeting-link/share-meeting-link.component';

/**
 * Reusable component for displaying the share meeting link panel
 * inside the participants panel.
 */
@Component({
	selector: 'ov-meeting-share-link-panel',
	templateUrl: './meeting-share-link-panel.component.html',
	styleUrls: ['./meeting-share-link-panel.component.scss'],
	imports: [CommonModule, ShareMeetingLinkComponent]
})
export class MeetingShareLinkPanelComponent {
	/**
	 * Controls whether the share link panel should be shown
	 */
	@Input() showShareLink = true;

	/**
	 * The meeting URL to share
	 */
	@Input({ required: true }) meetingUrl = '';

	/**
	 * Emitted when the copy button is clicked
	 */
	@Output() copyClicked = new EventEmitter<void>();

	/**
	 * Alternative to @Output: Function to call when copy button is clicked
	 * When using NgComponentOutlet, use this instead of the @Output above
	 */
	@Input() copyClickedFn?: () => void;

	onCopyClicked(): void {
		if (this.copyClickedFn) {
			this.copyClickedFn();
		} else {
			this.copyClicked.emit();
		}
	}
}
