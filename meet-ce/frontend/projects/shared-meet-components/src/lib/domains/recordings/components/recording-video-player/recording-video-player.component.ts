import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, inject, input, output, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MeetRecordingStatus } from '@openvidu-meet/typings';
import { ViewportService } from '../../../meeting/openvidu-components';
import { RecordingUiUtils } from '../../utils/ui';

@Component({
	selector: 'ov-recording-video-player',
	imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule, MatTooltipModule],
	templateUrl: './recording-video-player.component.html',
	styleUrl: './recording-video-player.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class RecordingVideoPlayerComponent implements OnDestroy {
	/**
	 * URL of the recording video to play
	 */
	recordingUrl = input<string | undefined>(undefined);

	/**
	 * Recording status (to show appropriate messages)
	 */
	recordingStatus = input<MeetRecordingStatus>(MeetRecordingStatus.COMPLETE);

	/**
	 * Whether to show download button
	 */
	showDownload = input(true);

	/**
	 * Whether to show share button
	 */
	showShare = input(true);

	/**
	 * Emitted when video successfully loads
	 */
	videoLoaded = output<void>();

	/**
	 * Emitted when video fails to load
	 */
	videoError = output<void>();

	/**
	 * Emitted when download button is clicked
	 */
	download = output<void>();

	/**
	 * Emitted when share button is clicked
	 */
	share = output<void>();

	/**
	 * Emitted when retry button is clicked
	 */
	retry = output<void>();

	// Internal state
	hasVideoError = false;
	isVideoLoaded = false;
	showMobileControls = true;

	videoPlayer = viewChild<ElementRef<HTMLVideoElement>>('videoPlayer');

	private controlsTimeout?: number;

	viewportService = inject(ViewportService);

	async onVideoLoaded() {
		this.isVideoLoaded = true;
		this.hasVideoError = false;
		this.videoLoaded.emit();

		// Start controls timeout for mobile
		if (this.viewportService.isMobileView()) {
			this.resetControlsTimeout();
		}

		// try play unmuted and if it fails, mute and play again
		const videoElement = this.videoPlayer()?.nativeElement;
		if (videoElement) {
			try {
				await videoElement.play();
				// Autoplay started successfully without muting
			} catch (error) {
				// Autoplay was prevented, mute and try again
				videoElement.muted = true;
				videoElement.play().catch((err) => {
					console.error('Error playing video after muting:', err);
				});
			}
		}
	}

	onVideoError() {
		console.error('Error loading video');
		this.hasVideoError = true;
		this.isVideoLoaded = false;
		this.videoError.emit();
	}

	onDownloadClick() {
		this.download.emit();
	}

	onShareClick() {
		this.share.emit();
	}

	onRetryClick() {
		this.hasVideoError = false;
		this.isVideoLoaded = false;
		this.retry.emit();
	}

	getStatusIcon(): string {
		return RecordingUiUtils.getPlayerStatusIcon(this.recordingStatus());
	}

	getStatusMessage(): string {
		return RecordingUiUtils.getPlayerStatusMessage(this.recordingStatus());
	}

	isRecordingInProgress(): boolean {
		return [MeetRecordingStatus.STARTING, MeetRecordingStatus.ACTIVE, MeetRecordingStatus.ENDING].includes(
			this.recordingStatus()
		);
	}

	private resetControlsTimeout(): void {
		if (this.controlsTimeout) {
			clearTimeout(this.controlsTimeout);
		}

		if (this.showMobileControls) {
			this.controlsTimeout = window.setTimeout(() => {
				this.showMobileControls = false;
			}, 3000); // Hide controls after 3 seconds
		}
	}

	ngOnDestroy(): void {
		if (this.controlsTimeout) {
			clearTimeout(this.controlsTimeout);
		}
	}
}
