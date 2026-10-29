import { Component, inject, input, output } from '@angular/core';
import { CustomDevice } from '../../../models/device.model';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { DeviceTrialService } from '../../../services/device-trial/device-trial.service';
import { AudioDevicesComponent } from '../audio-devices/audio-devices.component';
import { VideoDevicesComponent } from '../video-devices/video-devices.component';

/**
 * @internal
 * The Audio & video tab of the meeting settings: devices picked here are tried in the tab and only
 * reach the others when applied. Its trial lives and dies with the tab.
 */
@Component({
	selector: 'ov-audio-video-settings',
	imports: [TranslatePipe, VideoDevicesComponent, AudioDevicesComponent],
	providers: [DeviceTrialService],
	templateUrl: './audio-video-settings.component.html',
	styleUrl: './audio-video-settings.component.scss'
})
export class AudioVideoSettingsComponent {
	readonly showCamera = input(true);
	readonly showMicrophone = input(true);
	readonly onVideoDeviceChanged = output<CustomDevice>();
	readonly onVideoEnabledChanged = output<boolean>();
	readonly onAudioDeviceChanged = output<CustomDevice>();
	readonly onAudioEnabledChanged = output<boolean>();

	protected readonly trial = inject(DeviceTrialService);

	async apply(): Promise<void> {
		const { camera, microphone } = await this.trial.apply();

		if (camera) this.onVideoDeviceChanged.emit(camera);

		if (microphone) this.onAudioDeviceChanged.emit(microphone);
	}
}
