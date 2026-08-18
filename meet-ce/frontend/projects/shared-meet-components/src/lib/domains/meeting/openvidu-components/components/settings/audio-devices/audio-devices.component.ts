import { Component, inject, input, output, Signal, signal, WritableSignal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CustomDevice } from '../../../models/device.model';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { MicStatusAlertComponent } from '../../mic-status-alert/mic-status-alert.component';
import { DeviceService } from '../../../services/device/device.service';
import { LocalMediaControlService } from '../../../services/local-media-control/local-media-control.service';
import { LocalMediaStateService } from '../../../services/local-media-state/local-media-state.service';
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
	/** Single source of truth for the device state — valid in prejoin and in the meeting alike. */
	readonly isMicrophoneEnabled = inject(LocalMediaStateService).microphoneEnabled;
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
	private readonly localMediaControlService = inject(LocalMediaControlService);
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
		await this.localMediaControlService.setMicrophoneEnabled(enabled);
		this.microphoneStatusChanging.set(false);
		this.onAudioEnabledChanged.emit(enabled);
	}

	async onMicrophoneSelected(event: { value: CustomDevice }) {
		try {
			const device: CustomDevice = event?.value;

			if (this.deviceSrv.needUpdateAudioTrack(device)) {
				this.microphoneStatusChanging.set(true);
				await this.localMediaControlService.switchMicrophone(device.device);
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
