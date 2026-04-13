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
import { AppContextService } from '../../../../shared/services/app-context.service';
import { NotificationService } from '../../../../shared/services/notification.service';
import { MeetingWebComponentManagerService } from '../../../meeting/services/meeting-webcomponent-manager.service';
import { RoomMemberContextService } from '../../../room-members/services/room-member-context.service';
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
	recordingSecret?: string;
	canRetrieveRecordings = false;
	canDeleteRecordings = false;

	isLoading = true;
	hasError = false;

	constructor(
		protected recordingService: RecordingService,
		protected notificationService: NotificationService,
		protected navigationService: NavigationService,
		protected appCtxService: AppContextService,
		protected wcManagerService: MeetingWebComponentManagerService,
		protected roomMemberContextService: RoomMemberContextService,
		protected route: ActivatedRoute,
		public viewportService: ViewportService
	) {}

	async ngOnInit() {
		this.canRetrieveRecordings = this.roomMemberContextService.hasPermission('canRetrieveRecordings');
		this.canDeleteRecordings = this.roomMemberContextService.hasPermission('canDeleteRecordings');
		await this.loadRecording();
	}

	private async loadRecording() {
		const recordingId = this.route.snapshot.params['recording-id'];
		this.recordingSecret = this.route.snapshot.queryParams['recordingSecret'];

		if (!recordingId) {
			this.hasError = true;
			this.isLoading = false;
			return;
		}

		try {
			this.recording = await this.recordingService.getRecording(recordingId, this.recordingSecret);

			if (this.recording.status === MeetRecordingStatus.COMPLETE) {
				this.recordingUrl = this.recordingService.getRecordingMediaUrl(recordingId, this.recordingSecret);
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
			this.recordingService.downloadRecording(this.recording, this.recordingSecret);
		}
	}

	openShareDialog() {
		this.recordingService.openShareRecordingDialog(this.recording!.recordingId);
	}

	canDeleteRecording(): boolean {
		if (!this.recording) return false;

		const deletableStatuses = [
			MeetRecordingStatus.COMPLETE,
			MeetRecordingStatus.FAILED,
			MeetRecordingStatus.ABORTED,
			MeetRecordingStatus.LIMIT_REACHED
		];

		return this.canDeleteRecordings && deletableStatuses.includes(this.recording.status);
	}

	deleteRecording() {
		if (!this.recording || !this.canDeleteRecording()) return;

		const recording = this.recording;
		const deleteCallback = async () => {
			try {
				await this.recordingService.deleteRecording(recording.recordingId);
				this.notificationService.showSnackbar('Recording deleted successfully');

				// After deletion, navigate back to the room recordings page
				this.navigationService.navigateTo(`/room/${recording.roomId}/recordings`);
			} catch (error) {
				console.error('Error deleting recording:', error);
				this.notificationService.showSnackbar('Failed to delete recording');
			}
		};

		this.notificationService.showDialog({
			title: 'Delete Recording',
			icon: 'delete_outline',
			message: `Are you sure you want to delete the recording <b>${recording.recordingId}</b>?`,
			confirmText: 'Delete',
			cancelText: 'Cancel',
			confirmCallback: deleteCallback
		});
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

	/**
	 * Determines whether to show the back button based on the following conditions:
	 * - The user has permission to retrieve recordings and the recording info is available (to navigate back to the room recordings page)
	 * - The app is in embedded mode (to close the WebComponentManagerService)
	 * - A leave redirect URL is configured (to navigate to that URL)
	 */
	shouldShowBackButton(): boolean {
		return (
			(this.canRetrieveRecordings && !!this.recording?.roomId) ||
			this.appCtxService.isEmbeddedMode() ||
			!!this.navigationService.getLeaveRedirectURL()
		);
	}

	/**
	 * Handles the back button click event and navigates accordingly
	 * If the user has permission to retrieve recordings and the recording info is available, it navigates back to the room recordings page.
	 * If in embedded mode, it closes the WebComponentManagerService
	 * If the redirect URL is set, it navigates to that URL
	 * Otherwise, it does nothing (the back button should not be shown in this case)
	 */
	async goBack(): Promise<void> {
		if (this.canRetrieveRecordings && this.recording?.roomId) {
			// Navigate back to the room recordings page
			await this.navigationService.navigateTo(`/room/${this.recording.roomId}/recordings`);
			return;
		}

		if (this.appCtxService.isEmbeddedMode()) {
			this.wcManagerService.close();
		}

		if (this.navigationService.getLeaveRedirectURL()) {
			// Redirect to the configured leave URL if it exists
			await this.navigationService.redirectToLeaveUrl();
		}
	}
}
