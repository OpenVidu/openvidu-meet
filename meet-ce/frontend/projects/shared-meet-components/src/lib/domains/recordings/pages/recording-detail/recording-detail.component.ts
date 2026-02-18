import { Clipboard } from '@angular/cdk/clipboard';
import { DatePipe } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { MeetRecordingInfo, MeetRecordingStatus } from '@openvidu-meet/typings';
import { ILogger, LoggerService } from 'openvidu-components-angular';
import { BreadcrumbComponent, BreadcrumbItem } from '../../../../shared/components/breadcrumb/breadcrumb.component';
import { NavigationService } from '../../../../shared/services/navigation.service';
import { NotificationService } from '../../../../shared/services/notification.service';
import { RecordingVideoPlayerComponent } from '../../components/recording-video-player/recording-video-player.component';
import { RecordingService } from '../../services/recording.service';
import { RecordingUiUtils } from '../../utils/ui';

@Component({
	selector: 'ov-recording-detail',
	imports: [
		MatCardModule,
		MatButtonModule,
		MatIconModule,
		MatTooltipModule,
		MatProgressSpinnerModule,
		MatDividerModule,
		DatePipe,
		RouterModule,
		BreadcrumbComponent,
		RecordingVideoPlayerComponent
	],
	templateUrl: './recording-detail.component.html',
	styleUrl: './recording-detail.component.scss'
})
export class RecordingDetailComponent implements OnInit {
	recording = signal<MeetRecordingInfo | undefined>(undefined);
	recordingUrl = signal<string | undefined>(undefined);
	isLoading = signal(true);
	hasError = signal(false);
	breadcrumbItems = signal<BreadcrumbItem[]>([]);

	protected log: ILogger;
	readonly MeetRecordingStatus = MeetRecordingStatus;
	protected readonly RecordingUiUtils = RecordingUiUtils;

	constructor(
		private route: ActivatedRoute,
		private recordingService: RecordingService,
		private notificationService: NotificationService,
		protected navigationService: NavigationService,
		private clipboard: Clipboard,
		protected loggerService: LoggerService
	) {
		this.log = this.loggerService.get('OpenVidu Meet - RecordingDetailComponent');
	}

	async ngOnInit() {
		const recordingId = this.route.snapshot.paramMap.get('recordingId');
		if (!recordingId) {
			this.hasError.set(true);
			this.isLoading.set(false);
			return;
		}

		await this.loadRecordingDetails(recordingId);
	}

	private async loadRecordingDetails(recordingId: string) {
		try {
			this.isLoading.set(true);
			const recording = await this.recordingService.getRecording(recordingId);
			this.recording.set(recording);

			this.breadcrumbItems.set([
				{
					label: 'Recordings',
					action: () => this.navigationService.navigateTo('/recordings')
				},
				{
					label: RecordingUiUtils.getDisplayName(recording)
				}
			]);

			if (RecordingUiUtils.isComplete(recording.status)) {
				this.recordingUrl.set(this.recordingService.getRecordingMediaUrl(recordingId));
			}
		} catch (error) {
			this.log.e('Error loading recording details:', error);
			this.notificationService.showSnackbar('Failed to load recording details');
			this.hasError.set(true);
		} finally {
			this.isLoading.set(false);
		}
	}

	async downloadRecording() {
		const rec = this.recording();
		if (!rec) return;
		this.recordingService.downloadRecording(rec);
	}

	async shareRecording() {
		const rec = this.recording();
		if (!rec) return;
		this.recordingService.openShareRecordingDialog(rec.recordingId);
	}

	copyRecordingId() {
		const rec = this.recording();
		if (!rec) return;
		this.clipboard.copy(rec.recordingId);
		this.notificationService.showSnackbar('Recording ID copied to clipboard');
	}

	async deleteRecording() {
		const rec = this.recording();
		if (!rec) return;

		try {
			await this.recordingService.deleteRecording(rec.recordingId);
			this.notificationService.showSnackbar('Recording deleted successfully');
			await this.navigationService.navigateTo('/recordings');
		} catch (error) {
			this.log.e('Error deleting recording:', error);
			this.notificationService.showSnackbar('Failed to delete recording');
		}
	}

	get isComplete(): boolean {
		return RecordingUiUtils.isComplete(this.recording()?.status);
	}

	onVideoError() {
		this.notificationService.showSnackbar('Error loading video. Please try again.');
	}
}
