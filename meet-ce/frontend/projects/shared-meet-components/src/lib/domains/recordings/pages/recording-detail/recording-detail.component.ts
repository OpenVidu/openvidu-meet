import { Clipboard } from '@angular/cdk/clipboard';
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { MeetRecordingInfo } from '@openvidu-meet/typings';
import { BreadcrumbComponent, BreadcrumbItem } from '../../../../shared/components/breadcrumb/breadcrumb.component';
import { NavigationService } from '../../../../shared/services/navigation.service';
import { NotificationService } from '../../../../shared/services/notification.service';
import { ILogger, LoggerService } from '../../../meeting/openvidu-components';
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
	styleUrl: './recording-detail.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class RecordingDetailComponent implements OnInit {
	private readonly route = inject(ActivatedRoute);
	private readonly recordingService = inject(RecordingService);
	private readonly notificationService = inject(NotificationService);
	protected readonly navigationService = inject(NavigationService);
	private readonly clipboard = inject(Clipboard);
	protected readonly loggerService = inject(LoggerService);
	protected readonly log: ILogger = this.loggerService.get('OpenVidu Meet - RecordingDetailComponent');

	recordingId = signal<string>('');
	recording = signal<MeetRecordingInfo | undefined>(undefined);
	recordingUrl = signal<string | undefined>(undefined);
	isLoading = signal(true);
	hasError = signal(false);
	breadcrumbItems = signal<BreadcrumbItem[]>([]);

	protected readonly RecordingUiUtils = RecordingUiUtils;

	async ngOnInit() {
		const recordingId = this.route.snapshot.paramMap.get('recording-id');
		if (!recordingId) {
			this.hasError.set(true);
			this.isLoading.set(false);
			return;
		}

		this.recordingId.set(recordingId);
		await this.loadRecordingDetails();
	}

	private async loadRecordingDetails() {
		try {
			this.isLoading.set(true);
			const recording = await this.recordingService.getRecording(this.recordingId());
			this.recording.set(recording);

			this.breadcrumbItems.set([
				{
					label: 'Recordings',
					action: () => this.navigationService.navigateTo('/recordings')
				},
				{
					label: this.recordingId()
				}
			]);

			if (RecordingUiUtils.isPlayable(recording.status)) {
				this.recordingUrl.set(this.recordingService.getRecordingMediaUrl(this.recordingId()));
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
		const rec = this.recording()!;
		this.recordingService.downloadRecording(rec);
	}

	async shareRecording() {
		this.recordingService.openShareRecordingDialog(this.recordingId(), true);
	}

	copyRecordingId() {
		this.clipboard.copy(this.recordingId());
		this.notificationService.showSnackbar('Recording ID copied to clipboard');
	}

	async deleteRecording() {
		const deleteCallback = async () => {
			try {
				await this.recordingService.deleteRecording(this.recordingId());
				this.notificationService.showSnackbar('Recording deleted successfully');

				// After deletion, navigate back to recordings page
				await this.navigationService.navigateTo('/recordings');
			} catch (error) {
				console.error('Error deleting recording:', error);
				this.notificationService.showSnackbar('Failed to delete recording');
			}
		};

		this.notificationService.showDialog({
			title: 'Delete Recording',
			icon: 'delete_forever',
			message: `Are you sure you want to permanently delete the recording <b>${this.recordingId()}</b>? This action cannot be undone.`,
			confirmText: 'Delete',
			cancelText: 'Cancel',
			confirmCallback: deleteCallback
		});
	}

	async retryLoad() {
		this.hasError.set(false);
		await this.loadRecordingDetails();
	}
}
