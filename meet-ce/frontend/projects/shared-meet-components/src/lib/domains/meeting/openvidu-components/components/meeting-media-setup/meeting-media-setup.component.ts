import { Component, computed, effect, inject, input, OnDestroy, OnInit, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AvatarView } from '../../models/avatar-view.model';
import { CustomDevice } from '../../models/device.model';
import { LangOption } from '../../models/lang.model';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { CdkOverlayService } from '../../services/cdk-overlay/cdk-overlay.service';
import { MeetingUiConfigService } from '../../services/config/meeting-ui-config.service';
import { DeviceService } from '../../services/device/device.service';
import { LocalMediaStateService } from '../../services/local-media-state/local-media-state.service';
import { LocalTrackService } from '../../services/local-track/local-track.service';
import { MeetingTranslateService } from '../../services/translate/meeting-translate.service';
import { ViewportService } from '../../services/viewport/viewport.service';
import { VirtualBackgroundService } from '../../services/virtual-background/virtual-background.service';
import { LandscapeWarningComponent } from '../landscape-warning/landscape-warning.component';
import { VideoElementComponent } from '../video-element/video-element.component';
import { BackgroundEffectsPanelComponent } from '../panel/background-effects-panel/background-effects-panel.component';
import { AudioDevicesComponent } from '../settings/audio-devices/audio-devices.component';
import { LangSelectorComponent } from '../settings/lang-selector/lang-selector.component';
import { VideoDevicesComponent } from '../settings/video-devices/video-devices.component';
import { LoggerService } from '../../../../../shared/services/logger.service';
import type { ILogger } from '../../../../../shared/models/logger.model';

/**
 * @internal
 */
@Component({
	selector: 'ov-meeting-media-setup',
	imports: [
		MatButtonModule,
		MatIconModule,
		MatProgressSpinnerModule,
		MatTooltipModule,
		TranslatePipe,
		LandscapeWarningComponent,
		LangSelectorComponent,
		VideoElementComponent,
		VideoDevicesComponent,
		AudioDevicesComponent,
		BackgroundEffectsPanelComponent
	],
	templateUrl: './meeting-media-setup.component.html',
	styleUrl: './meeting-media-setup.component.scss'
})
export class MeetingMediaSetupComponent implements OnInit, OnDestroy {
	readonly error = input<{ name: string; message: string } | undefined>(undefined);
	readonly onVideoDeviceChanged = output<CustomDevice>();
	readonly onAudioDeviceChanged = output<CustomDevice>();
	readonly onVideoEnabledChanged = output<boolean>();
	readonly onAudioEnabledChanged = output<boolean>();
	readonly onLangChanged = output<LangOption>();
	readonly onReadyToJoin = output<void>();
	private readonly libService = inject(MeetingUiConfigService);
	private readonly deviceSrv = inject(DeviceService);
	private readonly localTrackService = inject(LocalTrackService);
	private readonly localMediaState = inject(LocalMediaStateService);

	readonly errorMessage = signal<string | undefined>(undefined);
	readonly isLoading = signal(true);
	readonly participantName = signal<string>('');

	/**
	 * @ignore
	 */
	readonly showCameraControls = this.libService.showCameraControlsSignal;
	readonly showMicrophoneControls = this.libService.showMicrophoneControlsSignal;
	readonly showBackgroundsButton = this.libService.backgroundEffectsButtonSignal;
	readonly showLogo = this.libService.displayLogoSignal;

	readonly showBackgroundPanel = signal(false);

	/** Preview track, read from the media layer so a device switch or a fresh camera lands here too. */
	readonly videoTrack = this.localTrackService.cameraTrack;
	/**
	 * Single source of truth for the camera state, so a host `mediaToggleVideo` command lands on this
	 * screen too — it used to be a local snapshot only the local click could move.
	 */
	readonly isVideoEnabled = this.localMediaState.cameraEnabled;
	readonly hasVideoDevices = this.deviceSrv.hasVideoDevices;

	/**
	 * Avatar poster descriptor for the local preview. There is no participant stream during
	 * pre-join, so the view-model is built straight from the local form state.
	 */
	readonly avatarView = computed<AvatarView>(() => ({
		show: !this.isVideoEnabled(),
		name: this.participantName(),
		color: 'hsl(48, 100%, 50%)',
		isSpeaking: false,
		hasEncryptionError: false
	}));
	private readonly cdkSrv = inject(CdkOverlayService);
	private readonly virtualBackgroundService = inject(VirtualBackgroundService);
	private readonly translateService = inject(MeetingTranslateService);
	protected readonly viewportService = inject(ViewportService);
	private log: ILogger = inject(LoggerService).get('MeetingMediaSetupComponent');
	private shouldRemoveTracksWhenComponentIsDestroyed = true;

	private readonly errorEffect = effect(() => {
		const currentError = this.error();

		if (currentError) {
			this.errorMessage.set(currentError.message ?? currentError.name);
		}
	});

	private readonly participantNameEffect = effect(() => {
		const configuredName = this.libService.participantNameSignal();

		if (configuredName) {
			this.participantName.set(configuredName);
		}
	});

	async ngOnInit() {
		await this.initializeDevicesWithRetry();
		this.isLoading.set(false);
	}

	async ngOnDestroy() {
		this.cdkSrv.setSelector('body');

		if (this.shouldRemoveTracksWhenComponentIsDestroyed) {
			// Stop and release the prejoin tracks. Clearing the track signal drops the local-media
			// state to `undefined`, which detaches the mic-activity monitor automatically.
			// On join (shouldRemove=false) the tracks are kept — connect() publishes them and releases
			// the reference instead, so monitoring hands off to the connected participant seamlessly.
			this.localTrackService.removeLocalTracks();
		}
	}

	onDeviceSelectorClicked() {
		// Some devices as iPhone do not show the menu panels correctly
		// Updating the container where the panel is added fix the problem.
		this.cdkSrv.setSelector('#prejoin-container');
	}

	join() {
		const participantName = this.participantName().trim();

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

	videoEnabledChanged(enabled: boolean) {
		if (!enabled) {
			this.closeBackgroundPanel();
		}

		this.onVideoEnabledChanged.emit(enabled);
	}

	videoDeviceChanged(device: CustomDevice) {
		this.log.d('Video device changed to:', device);
		this.onVideoDeviceChanged.emit(device);
	}

	audioDeviceChanged(device: CustomDevice) {
		// The device switch replaced the underlying MediaStreamTrack; the mic-activity monitor
		// re-clones automatically via the local-media state — see LocalTrackService.switchMicrophone.
		this.log.d('Audio device changed to:', device);
		this.onAudioDeviceChanged.emit(device);
	}

	audioEnabledChanged(enabled: boolean) {
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
	private async initializeDevicesWithRetry(maxRetries = 3): Promise<void> {
		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			try {
				const tracks = await this.localTrackService.createLocalTracks();
				this.localTrackService.setLocalTracks(tracks);

				// Creating the tracks above is what grants media permission on first visit; only then
				// are device labels available. Populate the list and align the selection accordingly.
				await this.deviceSrv.syncDevicesAfterTrackCreation(tracks);

				// The mic-activity monitor starts automatically: setLocalTracks above populated the
				// local-media state, whose signal the MicActivityService effect follows.

				// Restore previously selected virtual background in prejoin when possible.
				// Skip restore when the user is not allowed to use virtual backgrounds.
				// Keep prejoin usable even if restore fails.
				if (this.showBackgroundsButton()) {
					try {
						await this.virtualBackgroundService.applyBackgroundFromStorage();
					} catch (error) {
						this.log.w('Failed to restore virtual background from storage in prejoin:', error);
					}
				}

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
