import { DatePipe } from '@angular/common';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { RecordingManagerService } from '@lib/services';
import { MeetRecordingInfo, MeetRecordingStatus } from '@lib/typings/ce';
import { ActionService } from 'openvidu-components-angular';
import { ShareMeetingLinkComponent } from '@lib/components/share-meeting-link/share-meeting-link.component';

@Component({
	selector: 'ov-view-recording',
	templateUrl: './view-recording.component.html',
	styleUrls: ['./view-recording.component.scss'],
	standalone: true,
	imports: [
		MatCardModule,
		MatButtonModule,
		MatIconModule,
		DatePipe,
		MatProgressSpinnerModule,
		MatTooltipModule,
		MatSnackBarModule,
		ShareMeetingLinkComponent
	]
})
export class ViewRecordingComponent implements OnInit, OnDestroy {
	recording?: MeetRecordingInfo;
	recordingUrl?: string;
	videoError = false;
	isLoading = true;
	hasError = false;
	isVideoLoaded = false;

	constructor(
		protected recordingService: RecordingManagerService,
		protected actionService: ActionService,
		protected route: ActivatedRoute,
		protected router: Router,
		private snackBar: MatSnackBar
	) {}

	async ngOnInit() {
		await this.loadRecording();
	}

	ngOnDestroy() {}

	private async loadRecording() {
		const recordingId = this.route.snapshot.paramMap.get('recording-id');
		const secret = this.route.snapshot.queryParams['secret'];

		if (!recordingId) {
			this.hasError = true;
			this.isLoading = false;
			return;
		}

		try {
			this.recording = await this.recordingService.getRecording(recordingId, secret);

			if (this.recording.status === MeetRecordingStatus.COMPLETE) {
				this.recordingUrl = this.recordingService.getRecordingMediaUrl(recordingId, secret);
			}
			console.warn('Recording loaded:', this.recordingUrl);
		} catch (error) {
			console.error('Error fetching recording:', error);
			this.hasError = true;
		} finally {
			this.isLoading = false;
		}
	}

	onVideoLoaded = () => {
		this.isVideoLoaded = true;
		this.videoError = false;
	};

	onVideoError = () => {
		this.videoError = true;
		this.isVideoLoaded = false;
	};

	downloadRecording() {
		if (!this.recording || !this.recordingUrl) {
			this.snackBar.open('Recording is not available for download', 'Close', { duration: 3000 });
			return;
		}

		this.recordingService.downloadRecording(this.recording);
		this.snackBar.open('Download started', 'Close', { duration: 2000 });
	}

	openShareDialog() {
		const url = window.location.href;
		this.recordingService.openShareRecordingDialog(this.recording!.recordingId, url);
	}

	// copyRecordingLink() {
	// 	const url = window.location.href;
	// 	navigator.clipboard.writeText(url).then(() => {
	// 		this.snackBar.open('Link copied to clipboard', 'Close', { duration: 2000 });
	// 	}).catch(() => {
	// 		this.snackBar.open('Failed to copy link', 'Close', { duration: 3000 });
	// 	});
	// }

	goBack() {
		if (window.history.length > 1) {
			window.history.back();
		} else {
			this.router.navigate(['/']);
		}
	}

	retryLoad() {
		this.isLoading = true;
		this.hasError = false;
		this.videoError = false;
		this.loadRecording();
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

	formatDuration(durationSeconds: number): string {
		const minutes = Math.floor(durationSeconds / 60);
		const seconds = Math.floor(durationSeconds % 60);
		return `${minutes}:${seconds.toString().padStart(2, '0')}`;
	}
}
