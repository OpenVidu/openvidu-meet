import { Component, inject } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ShareRoomAccessLinkComponent } from '../../components/share-room-access-link/share-room-access-link.component';
import { MeetingEntryFlowService } from '../../services/meeting-entry-flow.service';
import { MeetingJoinService } from '../../services/meeting-join.service';

/**
 * Reusable component for the join screen.
 * Displays the form to join the meeting and optional recordings card.
 */
@Component({
	selector: 'ov-meeting-join',
	templateUrl: './meeting-join.component.html',
	styleUrls: ['./meeting-join.component.scss'],
	imports: [
		MatFormFieldModule,
		MatInputModule,
		ReactiveFormsModule,
		MatCardModule,
		MatButtonModule,
		MatIconModule,
		MatTooltipModule,
		ShareRoomAccessLinkComponent,
		TranslatePipe
	]
})
export class MeetingJoinComponent {
	protected joinService = inject(MeetingJoinService);
	private readonly entryFlow = inject(MeetingEntryFlowService);

	protected roomName = this.joinService.roomName;
	protected roomClosed = this.joinService.roomClosed;
	protected canJoinMeeting = this.joinService.canJoinMeeting;
	protected isE2EEEnabled = this.joinService.hasRoomE2EEEnabled;

	protected participantForm = this.joinService.participantForm;
	protected showE2EEKeyInput = this.joinService.showE2EEKeyInput;

	protected showRecordingCard = this.joinService.showRecordingCard;
	protected showShareLink = this.joinService.showShareLink;
	protected roomAccessUrl = this.joinService.roomAccessUrl;
	protected showBackButton = this.joinService.showBackButton;
	protected backButtonText = this.joinService.backButtonText;

	async onFormSubmit(): Promise<void> {
		await this.entryFlow.completeJoinScreen();
	}

	async onViewRecordingsClick(): Promise<void> {
		await this.joinService.goToRecordings();
	}

	async onBackClick(): Promise<void> {
		await this.joinService.goBack();
	}

	onCopyLinkClick(): void {
		this.joinService.copyRoomAccessLink();
	}
}
