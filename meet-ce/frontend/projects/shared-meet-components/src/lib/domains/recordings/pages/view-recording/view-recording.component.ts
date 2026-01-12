import { DatePipe } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, Router } from '@angular/router';
import { MeetRecordingInfo, MeetRecordingStatus } from '@openvidu-meet/typings';
import { ViewportService } from 'openvidu-components-angular';
import { formatDurationToTime, NotificationService } from '../../../../shared';
import { RecordingVideoPlayerComponent } from '../../components';
import { RecordingService } from '../../services';

@Component({
	selector: 'ov-view-recording',
	templateUrl: './view-recording.component.html',
	styleUrls: ['./view-recording.component.scss'],
	imports: [
		MatCardModule,
		MatButtonModule,
		MatIconModule,
		DatePipe,
		MatProgressSpinnerModule,
		MatTooltipModule,
		MatSnackBarModule,
		RecordingVideoPlayerComponent
	]
})
export class ViewRecordingComponent implements OnInit {
	recording?: MeetRecordingInfo;
	recordingUrl?: string;
	secret?: string;

	isLoading = true;
	hasError = false;

	constructor(
		protected recordingService: RecordingService,
		protected notificationService: NotificationService,
		protected route: ActivatedRoute,
		protected router: Router,
		public viewportService: ViewportService
	) {}

	async ngOnInit() {
		await this.loadRecording();
	}

	private async loadRecording() {
		const recordingId = this.route.snapshot.params['recording-id'];
		this.secret = this.route.snapshot.queryParams['secret'];

		if (!recordingId) {
			this.hasError = true;
			this.isLoading = false;
			return;
		}

		try {
			this.recording = await this.recordingService.getRecording(recordingId, this.secret);

			if (this.recording.status === MeetRecordingStatus.COMPLETE) {
				this.recordingUrl = this.recordingService.getRecordingMediaUrl(recordingId, this.secret);
			}
		} catch (error) {
			console.error('Error fetching recording:', error);
			this.hasError = true;
		} finally {
			this.isLoading = false;
		}
	}

	onVideoError() {
		console.error('Error loading video');
		this.notificationService.showSnackbar('Error loading video. Please try again.');
	}

	downloadRecording() {
		if (this.recording) {
			this.recordingService.downloadRecording(this.recording, this.secret);
		}
	}

	openShareDialog() {
		const url = window.location.href;
		this.recordingService.openShareRecordingDialog(this.recording!.recordingId, url);
	}

	async retryLoad() {
		this.isLoading = true;
		this.hasError = false;
		await this.loadRecording();
	}

	getStatusIcon(): string {
		if (!this.recording) return 'error_outline';

		switch (this.recording.status) {
			case MeetRecordingStatus.STARTING:
			case MeetRecordingStatus.ACTIVE:
			case MeetRecordingStatus.ENDING:
				return 'hourglass_empty';
			case MeetRecordingStatus.COMPLETE:
				return 'check_circle';
			default:
				return 'error_outline';
		}
	}

	getStatusMessage(): string {
		if (!this.recording) return 'Recording not found';

		switch (this.recording.status) {
			case MeetRecordingStatus.STARTING:
				return 'Recording is starting...';
			case MeetRecordingStatus.ACTIVE:
				return 'Recording is in progress...';
			case MeetRecordingStatus.ENDING:
				return 'Recording is finalizing...';
			case MeetRecordingStatus.COMPLETE:
				return 'Recording is ready to watch';
			default:
				return 'Recording has failed';
		}
	}

	formatDuration(duration: number): string {
		return formatDurationToTime(duration);
	}

	goBack(): void {
		// Try to go back in browser history, otherwise navigate to recordings
		if (window.history.length > 1) {
			window.history.back();
		} else {
			this.router.navigate(['/recordings']);
		}
	}
}
