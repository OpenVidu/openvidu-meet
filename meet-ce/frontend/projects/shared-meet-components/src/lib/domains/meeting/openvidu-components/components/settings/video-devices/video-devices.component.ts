import { Component, computed, inject, input, output, Signal, signal, WritableSignal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AvatarView } from '../../../models/avatar-view.model';
import { CustomDevice } from '../../../models/device.model';
import { PanelType } from '../../../models/panel.model';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { MeetingUiConfigService } from '../../../services/config/meeting-ui-config.service';
import { DeviceService } from '../../../services/device/device.service';
import { LocalMediaService } from '../../../services/local-media/local-media.service';
import { PanelService } from '../../../services/panel/panel.service';
import { ParticipantService } from '../../../services/participant/participant.service';
import { VideoElementComponent } from '../../video-element/video-element.component';
import { LoggerService } from '../../../../../../shared/services/logger.service';
import type { ILogger } from '../../../../../../shared/models/logger.model';

/**
 * @internal
 */
@Component({
	selector: 'ov-video-devices-select',
	imports: [MatButtonModule, MatIconModule, MatMenuModule, MatTooltipModule, TranslatePipe, VideoElementComponent],
	templateUrl: './video-devices.component.html',
	styleUrl: './video-devices.component.scss',
	host: { '[class.compact]': 'compact()' }
})
export class VideoDevicesComponent {
	readonly compact = input(false);
	readonly onVideoDeviceChanged = output<CustomDevice>();
	readonly onVideoEnabledChanged = output<boolean>();

	private readonly deviceSrv = inject(DeviceService);
	private readonly localMedia = inject(LocalMediaService);
	private readonly panelService = inject(PanelService);
	private readonly loggerSrv = inject(LoggerService);
	private readonly localParticipant = inject(ParticipantService).localParticipant;

	readonly cameraStatusChanging = signal(false);
	readonly isCameraEnabled = this.localMedia.camera.enabled;
	readonly videoTrack = this.localMedia.camera.track;
	readonly showBackgroundsButton = inject(MeetingUiConfigService).backgroundEffectsButtonSignal;
	readonly previewAvatar = computed<AvatarView>(() => ({
		show: !this.isCameraEnabled(),
		name: this.localParticipant()?.name ?? '',
		color: this.localParticipant()?.colorProfile ?? '',
		isSpeaking: false,
		hasEncryptionError: false
	}));

	protected readonly cameras: WritableSignal<CustomDevice[]>;
	protected readonly cameraSelected: WritableSignal<CustomDevice | undefined>;
	protected readonly hasVideoDevices: Signal<boolean>;

	private log: ILogger = {
		d: () => {},
		v: () => {},
		w: () => {},
		e: () => {}
	};

	constructor() {
		this.log = this.loggerSrv.get('VideoDevicesComponent');
		this.cameras = this.deviceSrv.cameras;
		this.cameraSelected = this.deviceSrv.cameraSelected;
		this.hasVideoDevices = this.deviceSrv.hasVideoDevices;
	}

	async toggleCam(event: MouseEvent) {
		event.stopPropagation();
		this.cameraStatusChanging.set(true);
		const enabled = !this.isCameraEnabled();

		try {
			await this.localMedia.setCameraEnabled(enabled);
			this.onVideoEnabledChanged.emit(enabled);
		} catch (error) {
			this.log.e('Error toggling camera', error);
		} finally {
			this.cameraStatusChanging.set(false);
		}
	}

	async onCameraSelected(event: { value: CustomDevice }) {
		try {
			const device: CustomDevice = event?.value;

			if (device.device !== this.cameraSelected()?.device) {
				this.cameraStatusChanging.set(true);
				await this.localMedia.switchCamera(device.device);
				this.deviceSrv.setCameraSelected(device.device);
				const selectedCamera = this.cameraSelected();

				if (selectedCamera) {
					this.onVideoDeviceChanged.emit(selectedCamera);
				}
			}
		} catch (error) {
			this.log.e('Error switching camera', error);
		} finally {
			this.cameraStatusChanging.set(false);
		}
	}

	openBackgroundEffects() {
		this.panelService.togglePanel(PanelType.BACKGROUND_EFFECTS);
	}
}
