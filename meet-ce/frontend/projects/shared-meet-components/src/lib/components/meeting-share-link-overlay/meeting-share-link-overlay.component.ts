import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ShareMeetingLinkComponent } from '../share-meeting-link/share-meeting-link.component';

/**
 * Reusable component for displaying the share meeting link overlay
 * when there are no remote participants in the meeting.
 */
@Component({
	selector: 'ov-meeting-share-link-overlay',
	templateUrl: './meeting-share-link-overlay.component.html',
	styleUrls: ['./meeting-share-link-overlay.component.scss'],
	imports: [CommonModule, ShareMeetingLinkComponent]
})
export class MeetingShareLinkOverlayComponent {
	/**
	 * Controls whether the overlay should be shown
	 */
	@Input() showOverlay = true;

	/**
	 * The meeting URL to share
	 */
	@Input({ required: true }) meetingUrl = '';

	/**
	 * Title text for the overlay
	 */
	@Input() title = 'Start collaborating';

	/**
	 * Subtitle text for the overlay
	 */
	@Input() subtitle = 'Share this link to bring others into the meeting';

	/**
	 * Title size (sm, md, lg, xl)
	 */
	@Input() titleSize: 'sm' | 'md' | 'lg' | 'xl' = 'xl';

	/**
	 * Title weight (normal, bold)
	 */
	@Input() titleWeight: 'normal' | 'bold' = 'bold';

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
