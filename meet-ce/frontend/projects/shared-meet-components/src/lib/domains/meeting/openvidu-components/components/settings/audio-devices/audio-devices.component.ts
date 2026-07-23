import { Component, OnInit, Signal, WritableSignal, effect, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CustomDevice } from '../../../models/device.model';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { MicStatusAlertComponent } from '../../mic-status-alert/mic-status-alert.component';
import { DeviceService } from '../../../services/device/device.service';
import { LocalMediaControlService } from '../../../services/local-media-control/local-media-control.service';
import { ParticipantService } from '../../../services/participant/participant.service';
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
export class AudioDevicesComponent implements OnInit {
	readonly compact = input(false);
	readonly onAudioDeviceChanged = output<CustomDevice>();
	readonly onAudioEnabledChanged = output<boolean>();

	microphoneStatusChanging: boolean = false;
	isMicrophoneEnabled: boolean = false;
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
	private readonly participantService = inject(ParticipantService);
	private readonly localMediaControlService = inject(LocalMediaControlService);
	private readonly loggerSrv = inject(LoggerService);

	constructor() {
		this.log = this.loggerSrv.get('AudioDevicesComponent');
		this.microphones = this.deviceSrv.microphones;
		this.microphoneSelected = this.deviceSrv.microphoneSelected;
		this.hasAudioDevices = this.deviceSrv.hasAudioDevices;

		// Keep the local flag in sync with the participant state. Persistence of the preference is
		// owned by the media-control service — do NOT write storage here, or a
		// non-user mute (e.g. moderator force-mute) would overwrite the user's preference.
		effect(() => {
			const participant = this.participantService.localParticipant();
			if (participant) {
				this.isMicrophoneEnabled = participant.isMicrophoneEnabled;
			}
		});
	}

	async ngOnInit() {
		this.isMicrophoneEnabled = this.localMediaControlService.isMyMicrophoneEnabled();
	}

	async toggleMic(event: MouseEvent) {
		event.stopPropagation();
		this.microphoneStatusChanging = true;
		this.isMicrophoneEnabled = !this.isMicrophoneEnabled;
		await this.localMediaControlService.setMicrophoneEnabled(this.isMicrophoneEnabled);
		this.microphoneStatusChanging = false;
		this.onAudioEnabledChanged.emit(this.isMicrophoneEnabled);
	}

	async onMicrophoneSelected(event: { value: CustomDevice }) {
		try {
			const device: CustomDevice = event?.value;
			if (this.deviceSrv.needUpdateAudioTrack(device)) {
				this.microphoneStatusChanging = true;
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
			this.microphoneStatusChanging = false;
		}
	}
}
