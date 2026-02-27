import { Clipboard } from '@angular/cdk/clipboard';
import { Component, Inject, OnInit } from '@angular/core';
import { ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
	MAT_DIALOG_DATA,
	MatDialogActions,
	MatDialogClose,
	MatDialogContent,
	MatDialogTitle
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RoomMemberContextService } from '../../../room-members/services/room-member-context.service';
import { RoomService } from '../../../rooms/services/room.service';
import { RecordingService } from '../../services/recording.service';

@Component({
	selector: 'ov-share-recording-dialog',
	imports: [
		FormsModule,
		MatRadioModule,
		MatFormFieldModule,
		MatInputModule,
		MatButtonModule,
		MatIconModule,
		MatDialogTitle,
		MatDialogContent,
		MatDialogActions,
		MatDialogClose,
		MatTooltipModule,
		MatProgressSpinnerModule
	],
	templateUrl: './recording-share-dialog.component.html',
	styleUrl: './recording-share-dialog.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class RecordingShareDialogComponent implements OnInit {
	accessType: 'private' | 'public' = 'public';
	canGenerateUrls = false;
	canGeneratePublicUrls = false;
	recordingUrl?: string;

	loading = false;
	erroMessage?: string;
	copied = false;

	constructor(
		@Inject(MAT_DIALOG_DATA)
		public data: {
			recordingId: string;
			hasRecordingAccess?: boolean;
		},
		private clipboard: Clipboard,
		private recordingService: RecordingService,
		private roomService: RoomService,
		private roomMemberContextService: RoomMemberContextService
	) {}

	async ngOnInit() {
		const hasRecordingAccess = this.data.hasRecordingAccess ?? true;
		this.canGenerateUrls =
			this.roomMemberContextService.hasPermission('canRetrieveRecordings') || hasRecordingAccess;

		// If the user cannot generate URLs, we can still show the current page URL for sharing,
		// but we won't attempt to generate a recording-specific URL
		if (!this.canGenerateUrls) {
			this.recordingUrl = window.location.href;
			return;
		}

		await this.loadAnonymousRecordingAccess();
	}

	/**
	 * Loads the room access configuration to determine if public recording URLs can be generated
	 * based on whether anonymous recording access is enabled for the room.
	 * Sets the canGeneratePublicUrls flag accordingly and defaults to private access if public URLs cannot be generated.
	 */
	private async loadAnonymousRecordingAccess() {
		this.canGeneratePublicUrls = false;
		try {
			const roomId = this.data.recordingId.split('--')[0];
			const { access } = await this.roomService.getRoom(roomId, { fields: ['access'] });
			this.canGeneratePublicUrls = access.anonymous.recording.enabled;
			if (!this.canGeneratePublicUrls) {
				this.accessType = 'private';
			}
		} catch (error) {
			console.error('Error checking room access config for recording URL generation:', error);
			this.canGeneratePublicUrls = false;
			this.accessType = 'private';
		}
	}

	async getRecordingUrl() {
		if (!this.canGenerateUrls) {
			this.erroMessage = 'You do not have permission to generate recording URLs.';
			return;
		}

		if (this.accessType === 'public' && !this.canGeneratePublicUrls) {
			this.erroMessage = 'Public recording URLs are not enabled for this room.';
			return;
		}

		this.loading = true;
		this.erroMessage = undefined;

		try {
			const privateAccess = this.accessType === 'private';
			const { url } = await this.recordingService.generateRecordingUrl(this.data.recordingId, privateAccess);
			this.recordingUrl = url;
		} catch (error) {
			this.erroMessage = 'Failed to generate recording URL. Please try again later.';
			console.error('Error generating recording URL:', error);
		} finally {
			this.loading = false;
		}
	}

	copyToClipboard() {
		if (!this.recordingUrl) {
			return;
		}

		this.clipboard.copy(this.recordingUrl!);
		this.copied = true;

		// Reset copied state after 2 seconds
		setTimeout(() => {
			this.copied = false;
		}, 2000);
	}

	get shouldShowGoBackButton(): boolean {
		return this.canGenerateUrls;
	}

	goBack() {
		this.recordingUrl = undefined;
		this.copied = false;
		this.erroMessage = undefined;
	}
}
