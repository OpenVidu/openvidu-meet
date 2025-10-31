import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { ShareMeetingLinkComponent } from '../share-meeting-link/share-meeting-link.component';

/**
 * Reusable component for the meeting lobby page.
 * Displays the form to join the meeting and optional recordings card.
 */
@Component({
	selector: 'ov-meeting-lobby',
	templateUrl: './meeting-lobby.component.html',
	styleUrls: ['./meeting-lobby.component.scss'],
	imports: [
		CommonModule,
		MatFormFieldModule,
		MatInputModule,
		FormsModule,
		ReactiveFormsModule,
		MatCardModule,
		MatButtonModule,
		MatIconModule,
		ShareMeetingLinkComponent
	]
})
export class MeetingLobbyComponent {
	/**
	 * The room name to display
	 */
	@Input({ required: true }) roomName = '';

	/**
	 * The meeting URL to share
	 */
	@Input() meetingUrl = '';

	/**
	 * Whether the room is closed
	 */
	@Input() roomClosed = false;

	/**
	 * Whether to show the recordings card
	 */
	@Input() showRecordingsCard = false;

	/**
	 * Whether to show the share meeting link component
	 */
	@Input() showShareLink = false;

	/**
	 * Whether to show the back button
	 */
	@Input() showBackButton = false;

	/**
	 * Back button text
	 */
	@Input() backButtonText = 'Back';

	/**
	 * The participant form group
	 */
	@Input({ required: true }) participantForm!: FormGroup;

	/**
	 * Emitted when the form is submitted
	 */
	@Output() formSubmitted = new EventEmitter<void>();

	/**
	 * Emitted when the view recordings button is clicked
	 */
	@Output() viewRecordingsClicked = new EventEmitter<void>();

	/**
	 * Emitted when the back button is clicked
	 */
	@Output() backClicked = new EventEmitter<void>();

	/**
	 * Emitted when the copy link button is clicked
	 */
	@Output() copyLinkClicked = new EventEmitter<void>();

	/**
	 * Alternative to @Output: Function to call when form is submitted
	 * When using NgComponentOutlet, use this instead of the @Output above
	 */
	@Input() formSubmittedFn?: () => void;

	/**
	 * Alternative to @Output: Function to call when view recordings is clicked
	 */
	@Input() viewRecordingsClickedFn?: () => void;

	/**
	 * Alternative to @Output: Function to call when back button is clicked
	 */
	@Input() backClickedFn?: () => void;

	/**
	 * Alternative to @Output: Function to call when copy link is clicked
	 */
	@Input() copyLinkClickedFn?: () => void;

	onFormSubmit(): void {
		if (this.formSubmittedFn) {
			this.formSubmittedFn();
		} else {
			this.formSubmitted.emit();
		}
	}

	onViewRecordingsClick(): void {
		if (this.viewRecordingsClickedFn) {
			this.viewRecordingsClickedFn();
		} else {
			this.viewRecordingsClicked.emit();
		}
	}

	onBackClick(): void {
		if (this.backClickedFn) {
			this.backClickedFn();
		} else {
			this.backClicked.emit();
		}
	}

	onCopyLinkClick(): void {
		if (this.copyLinkClickedFn) {
			this.copyLinkClickedFn();
		} else {
			this.copyLinkClicked.emit();
		}
	}
}
