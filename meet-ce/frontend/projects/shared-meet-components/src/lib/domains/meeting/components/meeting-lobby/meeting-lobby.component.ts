import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { ShareMeetingLinkComponent } from '../../components/share-meeting-link/share-meeting-link.component';
import { MeetingLobbyService } from '../../services/meeting-lobby.service';

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
	protected lobbyService = inject(MeetingLobbyService);

	protected roomName = this.lobbyService.roomName;
	protected roomClosed = this.lobbyService.roomClosed;
	protected isE2EEEnabled = this.lobbyService.hasRoomE2EEEnabled;

	protected participantForm = this.lobbyService.participantForm;
	protected showE2EEKeyInput = this.lobbyService.showE2EEKeyInput;

	protected showRecordingCard = this.lobbyService.showRecordingCard;
	protected showShareLink = this.lobbyService.showShareLink;
	protected meetingUrl = this.lobbyService.meetingUrl;
	protected showBackButton = this.lobbyService.showBackButton;
	protected backButtonText = this.lobbyService.backButtonText;

	async onFormSubmit(): Promise<void> {
		await this.lobbyService.submitAccess();
	}

	async onViewRecordingsClick(): Promise<void> {
		await this.lobbyService.goToRecordings();
	}

	async onBackClick(): Promise<void> {
		await this.lobbyService.goBack();
	}

	onCopyLinkClick(): void {
		this.lobbyService.copyMeetingSpeakerLink();
	}
}
