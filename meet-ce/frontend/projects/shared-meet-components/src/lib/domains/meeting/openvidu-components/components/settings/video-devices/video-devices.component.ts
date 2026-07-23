import { Component, OnInit, Signal, WritableSignal, effect, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CustomDevice } from '../../../models/device.model';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { DeviceService } from '../../../services/device/device.service';
import { ParticipantService } from '../../../services/participant/participant.service';
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
export class VideoDevicesComponent implements OnInit {
	readonly compact = input(false);
	readonly onVideoDeviceChanged = output<CustomDevice>();
	readonly onVideoEnabledChanged = output<boolean>();

	cameraStatusChanging: boolean = false;
	isCameraEnabled: boolean = false;

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
	private readonly participantService = inject(ParticipantService);
	private readonly loggerSrv = inject(LoggerService);

	constructor() {
		this.log = this.loggerSrv.get('VideoDevicesComponent');
		this.cameras = this.deviceSrv.cameras;
		this.cameraSelected = this.deviceSrv.cameraSelected;
		this.hasVideoDevices = this.deviceSrv.hasVideoDevices;

		// Keep the local flag in sync with the participant state. Persistence of the preference is
		// owned by the media-control service — do NOT write storage here.
		effect(() => {
			const participant = this.participantService.localParticipant();
			if (participant) {
				this.isCameraEnabled = participant.isCameraEnabled;
			}
		});
	}

	async ngOnInit() {
		this.isCameraEnabled = this.participantService.isMyCameraEnabled();
	}

	async toggleCam(event: MouseEvent) {
		event.stopPropagation();
		this.cameraStatusChanging = true;
		this.isCameraEnabled = !this.isCameraEnabled;
		await this.participantService.setCameraEnabled(this.isCameraEnabled);
		this.onVideoEnabledChanged.emit(this.isCameraEnabled);
		this.cameraStatusChanging = false;
	}

	async onCameraSelected(event: { value: CustomDevice }) {
		try {
			const device: CustomDevice = event?.value;

			// Is New deviceId different from the old one?
			if (this.deviceSrv.needUpdateVideoTrack(device)) {
				this.cameraStatusChanging = true;
				await this.participantService.switchCamera(device.device);
				this.deviceSrv.setCameraSelected(device.device);
				const selectedCamera = this.cameraSelected();
				if (selectedCamera) {
					this.onVideoDeviceChanged.emit(selectedCamera);
				}
			}
		} catch (error) {
			this.log.e('Error switching camera', error);
		} finally {
			this.cameraStatusChanging = false;
		}
	}
}
