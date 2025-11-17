import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { ShareMeetingLinkComponent } from '../../components';
import { MeetingLobbyService } from '../../services/meeting/meeting-lobby.service';
import { MeetingService } from '../../services/meeting/meeting.service';

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
	protected meetingService = inject(MeetingService);

	protected roomName = computed(() => this.lobbyService.state().room?.roomName);
	protected meetingUrl = computed(() => this.lobbyService.meetingUrl());
	protected roomClosed = computed(() => this.lobbyService.state().roomClosed);
	protected showRecordingCard = computed(() => this.lobbyService.state().showRecordingCard);
	protected showShareLink = computed(() => {
		const state = this.lobbyService.state();
		const canModerate = this.lobbyService.canModerateRoom();
		return !!state.room && !state.roomClosed && canModerate;
	});
	protected showBackButton = computed(() => this.lobbyService.state().showBackButton);
	protected backButtonText = computed(() => this.lobbyService.state().backButtonText);
	protected isE2EEEnabled = computed(() => this.lobbyService.state().hasRoomE2EEEnabled);
	protected participantForm = computed(() => this.lobbyService.state().participantForm);

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
