import { DatePipe } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute } from '@angular/router';
import { MeetRecordingInfo, MeetRecordingStatus } from '@openvidu-meet/typings';
import { ViewportService } from 'openvidu-components-angular';
import { NavigationService } from 'projects/shared-meet-components/src/lib/shared/services/navigation.service';
import { NotificationService } from '../../../../shared/services/notification.service';
import { RecordingVideoPlayerComponent } from '../../components/recording-video-player/recording-video-player.component';
import { RecordingService } from '../../services/recording.service';
import { RecordingUiUtils } from '../../utils/ui';

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
		protected navigationService: NavigationService,
		protected route: ActivatedRoute,
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
		return RecordingUiUtils.getPlayerStatusIcon(this.recording?.status);
	}

	getStatusMessage(): string {
		if (!this.recording) return 'Recording not found';
		return RecordingUiUtils.getPlayerStatusMessage(this.recording.status);
	}

	formatDuration(duration: number): string {
		return RecordingUiUtils.formatDuration(duration);
	}

	goBack(): void {
		// Try to go back in browser history, otherwise navigate to room recordings
		if (window.history.length > 1) {
			window.history.back();
		} else {
			this.navigationService.navigateTo(`/room/${this.recording?.roomId}/recordings`);
		}
	}
}
