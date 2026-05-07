import {
	ChangeDetectionStrategy,
	Component,
	ElementRef,
	OnDestroy,
	inject,
	input,
	output,
	signal,
	viewChild
} from '@angular/core';
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
	viewportService = inject(ViewportService);

	/**
	 * URL of the recording video to play
	 */
	recordingUrl = input<string | undefined>(undefined);

	/**
	 * Recording status (to show appropriate messages)
	 */
	recordingStatus = input<MeetRecordingStatus>(MeetRecordingStatus.COMPLETE);

	/**
	 * Emitted when retry button is clicked
	 */
	retry = output<void>();

	// Internal state
	hasVideoError = signal(false);
	isVideoLoaded = signal(false);
	showMobileControls = signal(true);
	private controlsTimeout?: number;

	videoPlayer = viewChild<ElementRef<HTMLVideoElement>>('videoPlayer');

	RecordingUiUtils = RecordingUiUtils;

	async onVideoLoaded() {
		this.isVideoLoaded.set(true);
		this.hasVideoError.set(false);

		// Start controls timeout for mobile
		if (this.viewportService.isMobileView()) {
			this.resetControlsTimeout();
		}

		// Try play unmuted and if it fails, mute and play again
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
		this.hasVideoError.set(true);
		this.isVideoLoaded.set(false);
	}

	onRetryClick() {
		this.hasVideoError.set(false);
		this.isVideoLoaded.set(false);
		this.retry.emit();
	}

	private resetControlsTimeout(): void {
		if (this.controlsTimeout) {
			clearTimeout(this.controlsTimeout);
		}

		if (this.showMobileControls()) {
			this.controlsTimeout = window.setTimeout(() => {
				this.showMobileControls.set(false);
			}, 3000); // Hide controls after 3 seconds
		}
	}

	ngOnDestroy(): void {
		if (this.controlsTimeout) {
			clearTimeout(this.controlsTimeout);
		}
	}
}
