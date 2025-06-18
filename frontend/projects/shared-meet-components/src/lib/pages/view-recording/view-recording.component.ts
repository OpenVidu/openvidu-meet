import { DatePipe } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, Router } from '@angular/router';
import { ActionService } from 'openvidu-components-angular';
import {MeetRecordingInfo, MeetRecordingStatus} from '../../typings/ce';
import { ShareRecordingDialogComponent } from '../../components';
import { HttpService } from '../../services';

@Component({
	selector: 'app-view-recording',
	templateUrl: './view-recording.component.html',
	styleUrls: ['./view-recording.component.scss'],
	standalone: true,
	imports: [MatCardModule, MatButtonModule, MatIconModule, DatePipe, MatProgressSpinnerModule]
})
export class ViewRecordingComponent implements OnInit {
	recording?: MeetRecordingInfo;
	recordingUrl?: string;

	videoError = false;

	constructor(
		protected httpService: HttpService,
		protected actionService: ActionService,
		protected router: Router,
		protected route: ActivatedRoute,
		protected dialog: MatDialog
	) {}

	async ngOnInit() {
		const recordingId = this.route.snapshot.paramMap.get('recording-id');
		const secret = this.route.snapshot.queryParams['secret'];

		try {
			this.recording = await this.httpService.getRecording(recordingId!, secret!);

			if (this.recording.status === MeetRecordingStatus.COMPLETE) {
				this.recordingUrl = this.httpService.getRecordingMediaUrl(recordingId!, secret!);
			}
		} catch (error) {
			console.error('Error fetching recording:', error);
		}
	}

	downloadRecording() {
		if (!this.recording || !this.recordingUrl) {
			console.error('Recording is not available for download');
			return;
		}

		const link = document.createElement('a');
		link.href = this.recordingUrl;
		link.download = this.recording.filename || 'openvidu-recording.mp4';
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
			data: {
				recordingId: this.recording!.recordingId,
				recordingUrl: window.location.href
			}
		});
	}
}
