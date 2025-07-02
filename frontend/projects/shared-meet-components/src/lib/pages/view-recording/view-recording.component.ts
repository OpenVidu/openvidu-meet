import { DatePipe } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute } from '@angular/router';
import { RecordingManagerService } from '@lib/services';
import { MeetRecordingInfo, MeetRecordingStatus } from '@lib/typings/ce';
import { ActionService } from 'openvidu-components-angular';

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
		protected recordingService: RecordingManagerService,
		protected actionService: ActionService,
		protected route: ActivatedRoute
	) {}

	async ngOnInit() {
		const recordingId = this.route.snapshot.paramMap.get('recording-id');
		const secret = this.route.snapshot.queryParams['secret'];

		try {
			this.recording = await this.recordingService.getRecording(recordingId!, secret);

			if (this.recording.status === MeetRecordingStatus.COMPLETE) {
				this.recordingUrl = this.recordingService.getRecordingMediaUrl(recordingId!, secret);
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

		this.recordingService.downloadRecording(this.recording);
	}

	openShareDialog() {
		const url = window.location.href;
		this.recordingService.openShareRecordingDialog(this.recording!.recordingId, url);
	}
}
