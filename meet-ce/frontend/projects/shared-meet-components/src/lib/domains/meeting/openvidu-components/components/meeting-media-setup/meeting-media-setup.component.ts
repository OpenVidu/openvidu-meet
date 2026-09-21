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
import type { LocalDevice } from '../../services/local-media/local-device';
import { LocalMediaService } from '../../services/local-media/local-media.service';
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
	private readonly localMedia = inject(LocalMediaService);

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

	readonly videoTrack = this.localMedia.camera.track;
	readonly isVideoEnabled = this.localMedia.camera.enabled;
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
		await this.initializeDevices();
		this.isLoading.set(false);
	}

	ngOnDestroy() {
		this.cdkSrv.setSelector('body');
	}

	onDeviceSelectorClicked() {
		// Some devices as iPhone do not show the menu panels correctly
		// Updating the container where the panel is added fix the problem.
		this.cdkSrv.setSelector('#prejoin-container');
	}

	join() {
		const participantName = this.participantName().trim();

		this.errorMessage.set(undefined);

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

	private handleError(error: any) {
		this.log.e('PreJoin component error:', error);
		this.errorMessage.set(error.message || this.translateService.translate('ERRORS.GENERIC'));
	}

	private async initializeDevices(): Promise<void> {
		try {
			await this.localMedia.acquire();

			const failure = this.deviceFailureMessage();

			if (failure) this.errorMessage.set(failure);

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
		} catch (error) {
			this.handleError(error);
		}
	}

	/**
	 * The message for a device the participant asked for and the browser did not hand over, so a
	 * camera that failed to start is not left looking like a camera the participant turned off.
	 * A device the machine does not have is not a failure, and neither is one nobody asked for.
	 */
	private deviceFailureMessage(): string | undefined {
		const closed = (device: LocalDevice) => device.wanted() && !device.track();
		const camera = this.deviceSrv.hasVideoDevices() && closed(this.localMedia.camera);
		const microphone = this.deviceSrv.hasAudioDevices() && closed(this.localMedia.microphone);

		if (camera && microphone) return this.translateService.translate('ERRORS.DEVICES_UNAVAILABLE');

		if (camera) return this.translateService.translate('ERRORS.CAMERA_UNAVAILABLE');

		if (microphone) return this.translateService.translate('ERRORS.MICROPHONE_UNAVAILABLE');

		return undefined;
	}
}
