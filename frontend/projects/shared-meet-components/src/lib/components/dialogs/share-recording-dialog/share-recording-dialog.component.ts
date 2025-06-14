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
import { MatRadioModule } from '@angular/material/radio';
import { HttpService } from 'shared-meet-components';

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
		MatDialogClose
	],
	templateUrl: './share-recording-dialog.component.html',
	styleUrl: './share-recording-dialog.component.scss'
})
export class ShareRecordingDialogComponent {
	accessType: 'private' | 'public' = 'private';
	recordingUrl: string | undefined;

	constructor(
		@Inject(MAT_DIALOG_DATA) public data: { recordingId: string },
		private httpService: HttpService
	) {}

	async getRecordingUrl() {
		const privateAccess = this.accessType === 'private';
		const { url } = await this.httpService.generateRecordingUrl(this.data.recordingId, privateAccess);
		this.recordingUrl = url;
	}

	copyToClipboard() {
		if (this.recordingUrl) {
			navigator.clipboard.writeText(this.recordingUrl);
		}
	}
}
