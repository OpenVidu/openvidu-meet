import { Component, inject, input, output, Signal, signal, WritableSignal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CustomDevice } from '../../../models/device.model';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { DeviceService } from '../../../services/device/device.service';
import { LocalMediaService } from '../../../services/local-media/local-media.service';
import { LoggerService } from '../../../../../../shared/services/logger.service';
import type { ILogger } from '../../../../../../shared/models/logger.model';

/**
 * @internal
 */
@Component({
	selector: 'ov-video-devices-select',
	imports: [MatButtonModule, MatIconModule, MatMenuModule, MatTooltipModule, TranslatePipe],
	templateUrl: './video-devices.component.html',
	styleUrl: './video-devices.component.scss'
})
export class VideoDevicesComponent {
	readonly compact = input(false);
	readonly onVideoDeviceChanged = output<CustomDevice>();
	readonly onVideoEnabledChanged = output<boolean>();

	readonly cameraStatusChanging = signal(false);
	readonly isCameraEnabled = inject(LocalMediaService).camera.enabled;

	protected readonly cameras: WritableSignal<CustomDevice[]>;
	protected readonly cameraSelected: WritableSignal<CustomDevice | undefined>;
	protected readonly hasVideoDevices: Signal<boolean>;

	private log: ILogger = {
		d: () => {},
		v: () => {},
		w: () => {},
		e: () => {}
	};

	private readonly deviceSrv = inject(DeviceService);
	private readonly localMedia = inject(LocalMediaService);
	private readonly loggerSrv = inject(LoggerService);

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
}
