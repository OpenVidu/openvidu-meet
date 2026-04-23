import { ChangeDetectionStrategy, Component, OnInit, Signal, WritableSignal, effect, inject, input, output } from '@angular/core';
import { CustomDevice } from '../../../models/device.model';
import { ILogger } from '../../../models/logger.model';
import { AppMaterialModule } from '../../../openvidu-components-angular.material.module';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { DeviceService } from '../../../services/device/device.service';
import { LoggerService } from '../../../services/logger/logger.service';
import { ParticipantService } from '../../../services/participant/participant.service';
import { StorageService } from '../../../services/storage/storage.service';

/**
 * @internal
 */
@Component({
	selector: 'ov-audio-devices-select',
	imports: [AppMaterialModule, TranslatePipe],
	templateUrl: './audio-devices.component.html',
	styleUrl: './audio-devices.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true
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
	private readonly storageSrv = inject(StorageService);
	private readonly participantService = inject(ParticipantService);
	private readonly loggerSrv = inject(LoggerService);

	constructor() {
		this.log = this.loggerSrv.get('AudioDevicesComponent');
		this.microphones = this.deviceSrv.microphones;
		this.microphoneSelected = this.deviceSrv.microphoneSelected;
		this.hasAudioDevices = this.deviceSrv.hasAudioDevices;

		// Use effect instead of subscription for reactive updates
		effect(() => {
			const participant = this.participantService.localParticipantSignal();
			if (participant) {
				this.isMicrophoneEnabled = participant.isMicrophoneEnabled;
				this.storageSrv.setMicrophoneEnabled(this.isMicrophoneEnabled);
			}
		});
	}

	async ngOnInit() {
		this.isMicrophoneEnabled = this.participantService.isMyMicrophoneEnabled();
	}

	async toggleMic(event: MouseEvent) {
		event.stopPropagation();
		this.microphoneStatusChanging = true;
		this.isMicrophoneEnabled = !this.isMicrophoneEnabled;
		await this.participantService.setMicrophoneEnabled(this.isMicrophoneEnabled);
		this.microphoneStatusChanging = false;
		this.storageSrv.setMicrophoneEnabled(this.isMicrophoneEnabled);
		this.onAudioEnabledChanged.emit(this.isMicrophoneEnabled);
	}

	async onMicrophoneSelected(event: { value: CustomDevice }) {
		try {
			const device: CustomDevice = event?.value;
			if (this.deviceSrv.needUpdateAudioTrack(device)) {
				this.microphoneStatusChanging = true;
				await this.participantService.switchMicrophone(device.device);
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

	/**
	 * @internal
	 * Compare two devices to check if they are the same. Used by the mat-select
	 */
	compareObjectDevices(o1: CustomDevice, o2: CustomDevice): boolean {
		return o1.label === o2.label;
	}
}
