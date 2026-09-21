import { Component, inject, input, output, Signal, signal, WritableSignal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CustomDevice } from '../../../models/device.model';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { MicStatusAlertComponent } from '../../mic-status-alert/mic-status-alert.component';
import { DeviceService } from '../../../services/device/device.service';
import { LocalMediaService } from '../../../services/local-media/local-media.service';
import { LoggerService } from '../../../../../../shared/services/logger.service';
import type { ILogger } from '../../../../../../shared/models/logger.model';

/**
 * @internal
 */
@Component({
	selector: 'ov-audio-devices-select',
	imports: [MatButtonModule, MatIconModule, MatMenuModule, MatTooltipModule, TranslatePipe, MicStatusAlertComponent],
	templateUrl: './audio-devices.component.html',
	styleUrl: './audio-devices.component.scss'
})
export class AudioDevicesComponent {
	readonly compact = input(false);
	readonly onAudioDeviceChanged = output<CustomDevice>();
	readonly onAudioEnabledChanged = output<boolean>();

	readonly microphoneStatusChanging = signal(false);
	readonly isMicrophoneEnabled = inject(LocalMediaService).microphone.enabled;
	private log: ILogger = {
		d: () => {},
		v: () => {},
		w: () => {},
		e: () => {}
	};

	// Expose signals directly from service (reactive)
	protected readonly microphones: WritableSignal<CustomDevice[]>;
	protected readonly microphoneSelected: WritableSignal<CustomDevice | undefined>;
	protected readonly hasAudioDevices: Signal<boolean>;

	private readonly deviceSrv = inject(DeviceService);
	private readonly localMedia = inject(LocalMediaService);
	private readonly loggerSrv = inject(LoggerService);

	constructor() {
		this.log = this.loggerSrv.get('AudioDevicesComponent');
		this.microphones = this.deviceSrv.microphones;
		this.microphoneSelected = this.deviceSrv.microphoneSelected;
		this.hasAudioDevices = this.deviceSrv.hasAudioDevices;
	}

	async toggleMic(event: MouseEvent) {
		event.stopPropagation();
		this.microphoneStatusChanging.set(true);
		const enabled = !this.isMicrophoneEnabled();

		try {
			await this.localMedia.setMicrophoneEnabled(enabled);
			this.onAudioEnabledChanged.emit(enabled);
		} catch (error) {
			this.log.e('Error toggling microphone', error);
		} finally {
			this.microphoneStatusChanging.set(false);
		}
	}

	async onMicrophoneSelected(event: { value: CustomDevice }) {
		try {
			const device: CustomDevice = event?.value;

			if (device.device !== this.microphoneSelected()?.device) {
				this.microphoneStatusChanging.set(true);
				await this.localMedia.switchMicrophone(device.device);
				this.deviceSrv.setMicSelected(device.device);
				const selectedMicrophone = this.microphoneSelected();

				if (selectedMicrophone) {
					this.onAudioDeviceChanged.emit(selectedMicrophone);
				}
			}
		} catch (error) {
			this.log.e('Error switching microphone', error);
		} finally {
			this.microphoneStatusChanging.set(false);
		}
	}
}
