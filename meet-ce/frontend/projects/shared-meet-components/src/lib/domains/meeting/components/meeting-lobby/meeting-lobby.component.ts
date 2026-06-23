import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ShareRoomAccessLinkComponent } from '../../components/share-room-access-link/share-room-access-link.component';
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
		MatFormFieldModule,
		MatInputModule,
		FormsModule,
		ReactiveFormsModule,
		MatCardModule,
		MatButtonModule,
		MatIconModule,
		MatTooltipModule,
		ShareRoomAccessLinkComponent,
		TranslatePipe
	],
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class MeetingLobbyComponent {
	protected lobbyService = inject(MeetingLobbyService);

	protected roomName = this.lobbyService.roomName;
	protected roomClosed = this.lobbyService.roomClosed;
	protected canJoinMeeting = this.lobbyService.canJoinMeeting;
	protected isE2EEEnabled = this.lobbyService.hasRoomE2EEEnabled;

	protected participantForm = this.lobbyService.participantForm;
	protected showE2EEKeyInput = this.lobbyService.showE2EEKeyInput;

	protected showRecordingCard = this.lobbyService.showRecordingCard;
	protected showShareLink = this.lobbyService.showShareLink;
	protected roomAccessUrl = this.lobbyService.roomAccessUrl;
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
		this.lobbyService.copyRoomAccessLink();
	}
}
