import { Clipboard } from '@angular/cdk/clipboard';
import { Component, Inject } from '@angular/core';
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
import { RecordingManagerService } from '@lib/services';

@Component({
	selector: 'ov-share-recording-dialog',
	standalone: true,
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
	templateUrl: './share-recording-dialog.component.html',
	styleUrl: './share-recording-dialog.component.scss'
})
export class ShareRecordingDialogComponent {
	accessType: 'private' | 'public' = 'public';
	recordingUrl?: string;
	private initialRecordingUrl?: string;

	loading = false;
	erroMessage?: string;
	copied = false;

	constructor(
		@Inject(MAT_DIALOG_DATA) public data: { recordingId: string; recordingUrl?: string },
		private recordingService: RecordingManagerService,
		private clipboard: Clipboard
	) {
		this.recordingUrl = data.recordingUrl;
		this.initialRecordingUrl = data.recordingUrl;
	}

	async getRecordingUrl() {
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
		return !this.initialRecordingUrl;
	}

	goBack() {
		this.recordingUrl = undefined;
		this.copied = false;
		this.erroMessage = undefined;
	}
}
