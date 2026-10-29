import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LoggerService } from '../../../../../../shared/services/logger.service';
import { CustomDevice } from '../../../models/device.model';
import { DeviceService } from '../../../services/device/device.service';
import { DeviceTrialService } from '../../../services/device-trial/device-trial.service';
import type { LocalTrack } from '../../../services/livekit';
import { Track } from '../../../services/livekit';
import { LivekitSdkService } from '../../../services/livekit/livekit-sdk.service';
import { LocalMediaService } from '../../../services/local-media/local-media.service';
import { AudioVideoSettingsComponent } from './audio-video-settings.component';

class LoggerServiceStub {
	get() {
		return { d: () => {}, v: () => {}, w: () => {}, e: () => {} };
	}
}

const front: CustomDevice = { label: 'Front', device: 'cam-front' };
const back: CustomDevice = { label: 'Back', device: 'cam-back' };

describe('AudioVideoSettingsComponent', () => {
	let captures: Array<{ stopped: boolean }>;

	beforeEach(() => {
		captures = [];

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				{ provide: LoggerService, useClass: LoggerServiceStub },
				{
					provide: LivekitSdkService,
					useValue: {
						createLocalTracks: async () => {
							const capture = {
								kind: Track.Kind.Video,
								stopped: false,
								stop() {
									this.stopped = true;
								},
								detach() {}
							};
							captures.push(capture);
							return [capture as unknown as LocalTrack];
						}
					}
				},
				{
					provide: LocalMediaService,
					useValue: {
						camera: { enabled: signal(true) },
						microphone: { enabled: signal(true) },
						switchCamera: async () => {},
						switchMicrophone: async () => {},
						reportUnavailable: () => {}
					}
				},
				{
					provide: DeviceService,
					useValue: {
						cameras: signal([front, back]),
						microphones: signal([]),
						cameraSelected: signal(front),
						microphoneSelected: signal(undefined),
						setCameraSelected: () => {},
						setMicSelected: () => {}
					}
				}
			]
		});
		TestBed.overrideComponent(AudioVideoSettingsComponent, { set: { template: '', imports: [] } });
	});

	it('gives each opening of the tab its own trial, closed with the tab', async () => {
		const first = TestBed.createComponent(AudioVideoSettingsComponent);
		const firstTrial = first.debugElement.injector.get(DeviceTrialService);
		await firstTrial.tryCamera(back);

		first.destroy();
		const second = TestBed.createComponent(AudioVideoSettingsComponent);
		const secondTrial = second.debugElement.injector.get(DeviceTrialService);

		expect(captures.map((capture) => capture.stopped)).toEqual([true]);
		expect(secondTrial).not.toBe(firstTrial);
		expect(secondTrial.pending()).toBeFalse();
	});

	it('announces the devices that were applied', async () => {
		const fixture = TestBed.createComponent(AudioVideoSettingsComponent);
		const trial = fixture.debugElement.injector.get(DeviceTrialService);
		const videoChanges: CustomDevice[] = [];
		const audioChanges: CustomDevice[] = [];
		fixture.componentInstance.onVideoDeviceChanged.subscribe((device) => videoChanges.push(device));
		fixture.componentInstance.onAudioDeviceChanged.subscribe((device) => audioChanges.push(device));
		spyOn(trial, 'apply').and.resolveTo({ camera: back, microphone: undefined });

		await fixture.componentInstance.apply();

		expect(videoChanges).toEqual([back]);
		expect(audioChanges).toEqual([]);
	});
});
