import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute } from '@angular/router';
import { MeetRecordingInfo } from '@openvidu-meet/typings';
import { NavigationService } from 'projects/shared-meet-components/src/lib/shared/services/navigation.service';
import { AppContextService } from '../../../../shared/services/app-context.service';
import { NotificationService } from '../../../../shared/services/notification.service';
import { ViewportService } from '../../../meeting/openvidu-components';
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
	],
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class ViewRecordingComponent implements OnInit {
	protected readonly recordingService = inject(RecordingService);
	protected readonly notificationService = inject(NotificationService);
	protected readonly navigationService = inject(NavigationService);
	protected readonly appCtxService = inject(AppContextService);
	protected readonly wcManagerService = inject(MeetingWebComponentManagerService);
	protected readonly roomMemberContextService = inject(RoomMemberContextService);
	protected readonly route = inject(ActivatedRoute);
	public readonly viewportService = inject(ViewportService);

	recordingId = '';
	recordingSecret?: string;
	recording = signal<MeetRecordingInfo | undefined>(undefined);
	recordingUrl = signal<string | undefined>(undefined);

	canRetrieveRecordings = computed(() => this.roomMemberContextService.permissions()?.canRetrieveRecordings ?? false);
	canDeleteRecordings = computed(() => this.roomMemberContextService.permissions()?.canDeleteRecordings ?? false);

	isLoading = signal(true);
	hasError = signal(false);

	RecordingUiUtils = RecordingUiUtils;

	async ngOnInit() {
		this.recordingId = this.route.snapshot.params['recording-id'];
		this.recordingSecret = this.route.snapshot.queryParams['recordingSecret'];

		await this.loadRecording();
	}

	private async loadRecording() {
		this.isLoading.set(true);

		try {
			const recording = await this.recordingService.getRecording(this.recordingId, this.recordingSecret);
			this.recording.set(recording);

			if (RecordingUiUtils.isPlayable(recording.status)) {
				this.recordingUrl.set(
					this.recordingService.getRecordingMediaUrl(this.recordingId, this.recordingSecret)
				);
			}
		} catch (error) {
			console.error('Error fetching recording:', error);
			this.hasError.set(true);
		} finally {
			this.isLoading.set(false);
		}
	}

	downloadRecording() {
		const recording = this.recording()!;
		this.recordingService.downloadRecording(recording, this.recordingSecret);
	}

	openShareDialog() {
		this.recordingService.openShareRecordingDialog(this.recordingId);
	}

	deleteRecording() {
		const recording = this.recording()!;

		const deleteCallback = async () => {
			try {
				await this.recordingService.deleteRecording(this.recordingId);
				this.notificationService.showSnackbar('Recording deleted successfully');

				// After deletion, navigate back to the room recordings page
				await this.navigationService.navigateTo(`/room/${recording.roomId}/recordings`);
			} catch (error) {
				console.error('Error deleting recording:', error);
				this.notificationService.showSnackbar('Failed to delete recording');
			}
		};

		this.notificationService.showDialog({
			title: 'Delete Recording',
			icon: 'delete_forever',
			message: `Are you sure you want to permanently delete the recording <b>${recording.recordingId}</b>? This action cannot be undone.`,
			confirmText: 'Delete',
			cancelText: 'Cancel',
			confirmCallback: deleteCallback
		});
	}

	async retryLoad() {
		this.hasError.set(false);
		await this.loadRecording();
	}

	/**
	 * Determines whether to show the back button based on the following conditions:
	 * - The user has permission to retrieve recordings and the recording info is available (to navigate back to the room recordings page)
	 * - The app is in embedded mode (to close the WebComponentManagerService)
	 * - A leave redirect URL is configured (to navigate to that URL)
	 */
	shouldShowBackButton(): boolean {
		const recording = this.recording();
		return (
			(this.canRetrieveRecordings() && !!recording?.roomId) ||
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
		const recording = this.recording();
		if (this.canRetrieveRecordings() && recording?.roomId) {
			// Navigate back to the room recordings page
			await this.navigationService.navigateTo(`/room/${recording.roomId}/recordings`);
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
