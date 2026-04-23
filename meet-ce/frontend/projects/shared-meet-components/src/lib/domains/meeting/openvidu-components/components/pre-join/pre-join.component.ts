import {
	ChangeDetectionStrategy,
	Component,
	effect,
	inject,
	input,
	OnDestroy,
	OnInit,
	output,
	signal
} from '@angular/core';
import { CustomDevice } from '../../models/device.model';
import { LangOption } from '../../models/lang.model';
import { ILogger } from '../../models/logger.model';
import { CdkOverlayService } from '../../services/cdk-overlay/cdk-overlay.service';
import { OpenViduComponentsConfigService } from '../../services/config/directive-config.service';
import { LocalTrack, Track } from '../../services/livekit-adapter';
import { LoggerService } from '../../services/logger/logger.service';
import { OpenViduService } from '../../services/openvidu/openvidu.service';
import { TranslateService } from '../../services/translate/translate.service';
import { ViewportService } from '../../services/viewport/viewport.service';

/**
 * @internal
 */
@Component({
	selector: 'ov-pre-join',
	templateUrl: './pre-join.component.html',
	styleUrl: './pre-join.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: {
		'(window:resize)': 'sizeChange()'
	},
	standalone: false
})
export class PreJoinComponent implements OnInit, OnDestroy {
	readonly error = input<{ name: string; message: string } | undefined>(undefined);
	readonly onVideoDeviceChanged = output<CustomDevice>();
	readonly onAudioDeviceChanged = output<CustomDevice>();
	readonly onVideoEnabledChanged = output<boolean>();
	readonly onAudioEnabledChanged = output<boolean>();
	readonly onLangChanged = output<LangOption>();
	readonly onReadyToJoin = output<void>();
	private readonly libService = inject(OpenViduComponentsConfigService);

	readonly errorMessage = signal<string | undefined>(undefined);
	windowSize!: number;
	readonly isLoading = signal(true);
	readonly participantName = signal<string>('');

	/**
	 * @ignore
	 */
	readonly isMinimal = this.libService.minimalSignal;
	readonly showCameraButton = this.libService.cameraButtonSignal;
	readonly showMicrophoneButton = this.libService.microphoneButtonSignal;
	readonly showLogo = this.libService.displayLogoSignal;
	readonly showParticipantName = this.libService.prejoinDisplayParticipantNameSignal;

	// Future feature preparation
	backgroundEffectEnabled: boolean = true; // Enable virtual backgrounds by default
	readonly showBackgroundPanel = signal(false);

	videoTrack: LocalTrack | undefined;
	audioTrack: LocalTrack | undefined;
	readonly isVideoEnabled = signal(false);
	readonly hasVideoDevices = signal(true);
	private tracks: LocalTrack[] = [];
	private readonly loggerSrv = inject(LoggerService);
	private readonly cdkSrv = inject(CdkOverlayService);
	private readonly openviduService = inject(OpenViduService);
	private readonly translateService = inject(TranslateService);
	protected readonly viewportService = inject(ViewportService);
	private log: ILogger = {
		d: () => {},
		v: () => {},
		w: () => {},
		e: () => {}
	};
	private shouldRemoveTracksWhenComponentIsDestroyed: boolean = true;

	sizeChange() {
		this.windowSize = window.innerWidth;
	}

	constructor() {
		this.log = this.loggerSrv.get('PreJoinComponent');
		effect(() => {
			const currentError = this.error();
			if (currentError) {
				this.errorMessage.set(currentError.message ?? currentError.name);
			}
		});

		effect(() => {
			const configuredName = this.libService.participantNameSignal();
			if (configuredName) {
				this.participantName.set(configuredName);
			}
		});
	}

	async ngOnInit() {
		await this.initializeDevicesWithRetry();
		this.windowSize = window.innerWidth;
		this.isLoading.set(false);
	}

	// ngAfterContentChecked(): void {
	// 	// this.changeDetector.detectChanges();
	// 	this.isLoading = false;
	// }

	async ngOnDestroy() {
		this.cdkSrv.setSelector('body');

		if (this.shouldRemoveTracksWhenComponentIsDestroyed) {
			this.tracks?.forEach((track) => {
				track.stop();
			});
		}
	}

	onDeviceSelectorClicked() {
		// Some devices as iPhone do not show the menu panels correctly
		// Updating the container where the panel is added fix the problem.
		this.cdkSrv.setSelector('#prejoin-container');
	}

	join() {
		const participantName = this.participantName().trim();

		if (this.showParticipantName() && !participantName) {
			this.errorMessage.set(this.translateService.translate('PREJOIN.NICKNAME_REQUIRED'));
			return;
		}

		// Clear any previous errors
		this.errorMessage.set(undefined);

		// Mark tracks as permanent for avoiding to be removed in ngOnDestroy
		this.shouldRemoveTracksWhenComponentIsDestroyed = false;

		// Assign participant name to the observable if it is defined
		if (participantName) {
			this.libService.updateGeneralConfig({ participantName });
			this.onReadyToJoin.emit();
		} else {
			// No participant name to set, emit immediately
			this.onReadyToJoin.emit();
		}
	}

	onParticipantNameChanged(name: string) {
		const trimmedName = name?.trim() || '';
		this.participantName.set(trimmedName);
		// Clear error when user starts typing
		if (this.errorMessage() && trimmedName) {
			this.errorMessage.set(undefined);
		}
	}

	onEnterPressed() {
		this.join();
	}

	async videoEnabledChanged(enabled: boolean) {
		this.isVideoEnabled.set(enabled);
		if (!enabled) {
			this.closeBackgroundPanel();
		} else if (!this.videoTrack) {
			const newVideoTrack = await this.openviduService.createLocalTracks(true, false);
			this.videoTrack = newVideoTrack[0];
			this.tracks.push(this.videoTrack);
			this.openviduService.setLocalTracks(this.tracks);
		}

		this.onVideoEnabledChanged.emit(enabled);
	}

	async videoDeviceChanged(device: CustomDevice) {
		try {
			this.log.d('Video device changed to:', device);

			// Get the updated tracks from the service
			const updatedTracks = this.openviduService.getLocalTracks();

			// Find the new video track
			const newVideoTrack = updatedTracks.find((track) => track.kind === Track.Kind.Video);

			// if (newVideoTrack && newVideoTrack !== this.videoTrack) {
			this.tracks = updatedTracks;
			this.videoTrack = newVideoTrack;

			this.onVideoDeviceChanged.emit(device);
		} catch (error) {
			this.log.e('Error handling video device change:', error);
			this.handleError(error);
		}
	}

	onVideoDevicesLoaded(devices: CustomDevice[]) {
		this.hasVideoDevices.set(devices.length > 0);
	}

	audioDeviceChanged(device: CustomDevice) {
		try {
			this.log.d('Audio device changed to:', device);

			// Get the updated tracks from the service
			const updatedTracks = this.openviduService.getLocalTracks();

			// Find the new audio track
			const newAudioTrack = updatedTracks.find((track) => track.kind === Track.Kind.Audio);

			this.tracks = updatedTracks;
			this.audioTrack = newAudioTrack;

			this.onAudioDeviceChanged.emit(device);
		} catch (error) {
			this.log.e('Error handling audio device change:', error);
			this.handleError(error);
		}
	}

	async audioEnabledChanged(enabled: boolean) {
		if (enabled && !this.audioTrack) {
			const newAudioTrack = await this.openviduService.createLocalTracks(false, true);
			this.audioTrack = newAudioTrack[0];
			this.tracks.push(this.audioTrack);
			this.openviduService.setLocalTracks(this.tracks);
		}
		this.onAudioEnabledChanged.emit(enabled);
	}

	/**
	 * Toggle virtual background panel visibility with smooth animation
	 */
	toggleBackgroundPanel() {
		// Add a small delay to ensure smooth transition
		if (!this.showBackgroundPanel()) {
			// Opening panel
			this.showBackgroundPanel.set(true);
		} else {
			// Closing panel - add slight delay for smooth animation
			setTimeout(() => {
				this.showBackgroundPanel.set(false);
			}, 50);
		}
	}

	/**
	 * Close virtual background panel with smooth animation
	 */
	closeBackgroundPanel() {
		// Add animation delay for smooth closing
		setTimeout(() => {
			this.showBackgroundPanel.set(false);
		}, 100);
	}

	/**
	 * Enhanced error handling with better UX
	 */
	private handleError(error: any) {
		this.log.e('PreJoin component error:', error);
		this.errorMessage.set(error.message || 'An unexpected error occurred');
	}

	/**
	 * Improved device initialization with error handling
	 */
	private async initializeDevicesWithRetry(maxRetries: number = 3): Promise<void> {
		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			try {
				this.tracks = await this.openviduService.createLocalTracks();
				this.openviduService.setLocalTracks(this.tracks);
				this.videoTrack = this.tracks.find((track) => track.kind === Track.Kind.Video);
				this.audioTrack = this.tracks.find((track) => track.kind === Track.Kind.Audio);
				this.isVideoEnabled.set(this.openviduService.isVideoTrackEnabled());

				return; // Success, exit retry loop
			} catch (error) {
				this.log.w(`Device initialization attempt ${attempt} failed:`, error);

				if (attempt === maxRetries) {
					this.handleError(error);
				} else {
					// Wait before retrying
					await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
				}
			}
		}
	}
}
