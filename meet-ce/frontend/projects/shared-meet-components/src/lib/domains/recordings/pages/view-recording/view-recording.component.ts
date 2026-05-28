import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute } from '@angular/router';
import { MeetRecordingInfo } from '@openvidu-meet/typings';
import { DialogPresetsService } from 'projects/shared-meet-components/src/lib/shared/services/dialog-presets.service';
import { NavigationService } from 'projects/shared-meet-components/src/lib/shared/services/navigation.service';
import { NotificationService } from '../../../../shared/services/notification.service';
import { AuthService } from '../../../auth/services/auth.service';
import { RuntimeConfigService } from '../../../../shared/services/runtime-config.service';
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
	protected readonly dialogPresetsService = inject(DialogPresetsService);
	protected readonly navigationService = inject(NavigationService);
	protected readonly runtimeConfigService = inject(RuntimeConfigService);
	protected readonly wcManager = inject(MeetingWebComponentManagerService);
	protected readonly roomMemberContextService = inject(RoomMemberContextService);
	protected readonly route = inject(ActivatedRoute);
	protected readonly authService = inject(AuthService);
	public readonly viewportService = inject(ViewportService);

	/**
	 * Optional inputs that take precedence over `ActivatedRoute.snapshot.params`.
	 * Populated when this component is rendered outside the Angular Router (e.g.
	 * the Angular Elements Web Component, which has no router and binds these
	 * directly). The SPA leaves them empty and falls back to the route snapshot.
	 */
	readonly recordingIdInput = input<string>('', { alias: 'recordingId' });
	readonly recordingSecretInput = input<string>('', { alias: 'recordingSecret' });

	recordingId = '';
	recordingSecret?: string;
	recording = signal<MeetRecordingInfo | undefined>(undefined);
	recordingUrl = signal<string | undefined>(undefined);
	isAuthenticated = signal(false);

	canRetrieveRecordings = computed(() => this.roomMemberContextService.permissions()?.canRetrieveRecordings ?? false);
	canDeleteRecordings = computed(() => this.roomMemberContextService.permissions()?.canDeleteRecordings ?? false);
	backButtonText = computed(() =>
		this.canRetrieveRecordings() && !!this.recording()?.roomId ? 'Back to Recordings' : 'Back'
	);
	canShowRecordingDetailsButton = computed(() => this.isAuthenticated() && this.canRetrieveRecordings());

	isLoading = signal(true);
	hasError = signal(false);

	RecordingUiUtils = RecordingUiUtils;

	async ngOnInit() {
		this.recordingId = this.recordingIdInput() || this.route.snapshot.params['recording-id'];
		this.recordingSecret = this.recordingSecretInput() || this.route.snapshot.queryParams['recordingSecret'];
		this.isAuthenticated.set(await this.authService.isUserAuthenticated());

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
			...this.dialogPresetsService.getDeleteRecordingDialogPreset(recording.recordingId),
			confirmCallback: deleteCallback
		});
	}

	async retryLoad() {
		this.hasError.set(false);
		await this.loadRecording();
	}

	goToRecordingDetails(): void {
		const url = this.navigationService.addBasePath(`/recordings/${this.recordingId}`);
		window.open(url, '_blank', 'noopener,noreferrer');
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
			this.runtimeConfigService.isWebcomponentMode() ||
			!!this.navigationService.getLeaveRedirectURL()
		);
	}

	/**
	 * Back-button handler:
	 * - If the user can list recordings, navigate to the room recordings page.
	 * - Else in webcomponent mode, emit `closed` so the host unmounts / follows
	 *   the configured `leave-redirect-url`.
	 * - Else in standalone mode, redirect to `leaveRedirectUrl` if set.
	 */
	async goBack(): Promise<void> {
		const recording = this.recording();
		if (this.canRetrieveRecordings() && recording?.roomId) {
			await this.navigationService.navigateTo(`/room/${recording.roomId}/recordings`);
			return;
		}

		if (this.runtimeConfigService.isWebcomponentMode()) {
			this.wcManager.emitClosedEvent();
			return;
		}

		if (this.navigationService.getLeaveRedirectURL()) {
			await this.navigationService.redirectToLeaveUrl();
		}
	}
}
