import { DatePipe } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute } from '@angular/router';
import { ShareRecordingDialogComponent } from '@lib/components';
import { HttpService } from '@lib/services';
import { ActionService, MeetRecordingInfo } from 'shared-meet-components';

@Component({
	selector: 'app-view-recording',
	templateUrl: './view-recording.component.html',
	styleUrls: ['./view-recording.component.scss'],
	standalone: true,
	imports: [MatCardModule, MatButtonModule, MatIconModule, DatePipe]
})
export class ViewRecordingComponent implements OnInit {
	recording: MeetRecordingInfo | undefined;
	recordingUrl: string | undefined;

	constructor(
		protected httpService: HttpService,
		protected actionService: ActionService,
		protected route: ActivatedRoute,
		protected dialog: MatDialog
	) {}

	async ngOnInit() {
		const recordingId = this.route.snapshot.paramMap.get('recording-id');
		const secret = this.route.snapshot.queryParams['secret'];

		this.recording = await this.httpService.getRecording(recordingId!, secret!);
		this.playRecording();
	}

	playRecording() {
		this.recordingUrl = this.httpService.getRecordingMediaUrl(this.recording!.recordingId);
	}

	downloadRecording() {
		const link = document.createElement('a');
		link.href = this.recordingUrl!;
		link.download = this.recording!.filename || 'openvidu-recording.mp4';
		link.dispatchEvent(
			new MouseEvent('click', {
				bubbles: true,
				cancelable: true,
				view: window
			})
		);

		// For Firefox it is necessary to delay revoking the ObjectURL
		setTimeout(() => link.remove(), 100);
	}

	openShareDialog() {
		this.dialog.open(ShareRecordingDialogComponent, {
			width: '400px',
			data: { recordingId: this.recording!.recordingId }
		});
	}
}
