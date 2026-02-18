import { Component, ElementRef, EventEmitter, Input, OnDestroy, Output, ViewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MeetRecordingStatus } from '@openvidu-meet/typings';
import { ViewportService } from 'openvidu-components-angular';
import { RecordingUiUtils } from '../../utils/ui';

@Component({
	selector: 'ov-recording-video-player',
	imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule, MatTooltipModule],
	templateUrl: './recording-video-player.component.html',
	styleUrl: './recording-video-player.component.scss'
})
export class RecordingVideoPlayerComponent implements OnDestroy {
	/**
	 * URL of the recording video to play
	 */
	@Input() recordingUrl?: string;

	/**
	 * Recording status (to show appropriate messages)
	 */
	@Input() recordingStatus: MeetRecordingStatus = MeetRecordingStatus.COMPLETE;

	/**
	 * Whether to show download button
	 */
	@Input() showDownload = true;

	/**
	 * Whether to show share button
	 */
	@Input() showShare = true;

	/**
	 * Emitted when video successfully loads
	 */
	@Output() videoLoaded = new EventEmitter<void>();

	/**
	 * Emitted when video fails to load
	 */
	@Output() videoError = new EventEmitter<void>();

	/**
	 * Emitted when download button is clicked
	 */
	@Output() download = new EventEmitter<void>();

	/**
	 * Emitted when share button is clicked
	 */
	@Output() share = new EventEmitter<void>();

	/**
	 * Emitted when retry button is clicked
	 */
	@Output() retry = new EventEmitter<void>();

	// Internal state
	hasVideoError = false;
	isVideoLoaded = false;
	showMobileControls = true;

	@ViewChild('videoPlayer', { static: false }) videoPlayer?: ElementRef<HTMLVideoElement>;

	private controlsTimeout?: number;

	constructor(public viewportService: ViewportService) {}

	async onVideoLoaded() {
		this.isVideoLoaded = true;
		this.hasVideoError = false;
		this.videoLoaded.emit();

		// Start controls timeout for mobile
		if (this.viewportService.isMobileView()) {
			this.resetControlsTimeout();
		}

		// try play unmuted and if it fails, mute and play again
		if (this.videoPlayer && this.videoPlayer.nativeElement) {
			try {
				await this.videoPlayer.nativeElement.play();
				// Autoplay started successfully without muting
			} catch (error) {
				// Autoplay was prevented, mute and try again
				this.videoPlayer!.nativeElement.muted = true;
				this.videoPlayer!.nativeElement.play().catch((err) => {
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
		return RecordingUiUtils.getPlayerStatusIcon(this.recordingStatus);
	}

	getStatusMessage(): string {
		return RecordingUiUtils.getPlayerStatusMessage(this.recordingStatus);
	}

	isRecordingInProgress(): boolean {
		return [MeetRecordingStatus.STARTING, MeetRecordingStatus.ACTIVE, MeetRecordingStatus.ENDING].includes(
			this.recordingStatus
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
