import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LoggerService } from '../../../../../../shared/services/logger.service';
import { CustomDevice } from '../../../models/device.model';
import { DeviceService } from '../../../services/device/device.service';
import { DeviceTrialService } from '../../../services/device-trial/device-trial.service';
import { LocalMediaService } from '../../../services/local-media/local-media.service';
import { MicActivityService } from '../../../services/mic-activity/mic-activity.service';
import { AudioDevicesComponent } from './audio-devices.component';

class LoggerServiceStub {
	get() {
		return { d: () => {}, v: () => {}, w: () => {}, e: () => {} };
	}
}

const laptop: CustomDevice = { label: 'Laptop', device: 'mic-1' };
const headset: CustomDevice = { label: 'Headset', device: 'mic-2' };

describe('AudioDevicesComponent', () => {
	let component: AudioDevicesComponent;
	let localMedia: {
		setMicrophoneEnabled: jasmine.Spy;
		switchMicrophone: jasmine.Spy;
		microphone: { enabled: ReturnType<typeof signal<boolean>> };
	};
	let deviceService: { setMicSelected: jasmine.Spy };
	let micLevel: ReturnType<typeof signal<number>>;

	function create(trial?: unknown) {
		localMedia = {
			setMicrophoneEnabled: jasmine.createSpy('setMicrophoneEnabled'),
			switchMicrophone: jasmine.createSpy('switchMicrophone'),
			microphone: { enabled: signal(false) }
		};
		deviceService = { setMicSelected: jasmine.createSpy('setMicSelected') };
		micLevel = signal(0);

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				{ provide: LoggerService, useClass: LoggerServiceStub },
				{ provide: LocalMediaService, useValue: localMedia as unknown as LocalMediaService },
				{ provide: MicActivityService, useValue: { level: micLevel } as unknown as MicActivityService },
				{
					provide: DeviceService,
					useValue: {
						...deviceService,
						microphones: signal<CustomDevice[]>([laptop, headset]),
						microphoneSelected: signal<CustomDevice | undefined>(laptop),
						hasAudioDevices: signal(true)
					} as unknown as DeviceService
				},
				...(trial ? [{ provide: DeviceTrialService, useValue: trial }] : [])
			]
		});
		TestBed.overrideComponent(AudioDevicesComponent, { set: { template: '', imports: [], styles: [] } });

		component = TestBed.createComponent(AudioDevicesComponent).componentInstance;
	}

	describe('on the device setup screen', () => {
		beforeEach(() => create());

		it('is ready for the next toggle when the microphone could not be started', async () => {
			localMedia.setMicrophoneEnabled.and.rejectWith(new Error('NotReadableError'));

			await expectAsync(component.toggleMic(new MouseEvent('click'))).toBeResolved();

			expect(component.microphoneStatusChanging()).toBeFalse();
		});

		it('lights the level meter in proportion to what the microphone captures', () => {
			localMedia.microphone.enabled.set(true);
			micLevel.set(0.5);

			expect(component.litLevelBars()).toBe(component.levelBars.length / 2);
		});

		// The capture is still measured while muted, to warn about speaking while muted.
		it('keeps the level meter dark while the microphone is off', () => {
			micLevel.set(0.5);

			expect(component.litLevelBars()).toBe(0);
		});

		it('switches the microphone at once when one is picked', async () => {
			await component.onMicrophoneSelected({ value: headset });

			expect(localMedia.switchMicrophone).toHaveBeenCalledOnceWith('mic-2');
			expect(deviceService.setMicSelected).toHaveBeenCalledOnceWith('mic-2');
		});
	});

	describe('in the meeting settings', () => {
		let trial: {
			tryMicrophone: jasmine.Spy;
			microphone: {
				device: ReturnType<typeof signal<CustomDevice | undefined>>;
				level: ReturnType<typeof signal<number>>;
			};
			applying: ReturnType<typeof signal<boolean>>;
		};

		beforeEach(() => {
			trial = {
				tryMicrophone: jasmine.createSpy('tryMicrophone'),
				microphone: { device: signal<CustomDevice | undefined>(undefined), level: signal(0) },
				applying: signal(false)
			};
			create(trial);
		});

		it('tries a picked microphone without switching the published one', async () => {
			await component.onMicrophoneSelected({ value: headset });

			expect(trial.tryMicrophone).toHaveBeenCalledOnceWith(headset);
			expect(localMedia.switchMicrophone).not.toHaveBeenCalled();
			expect(deviceService.setMicSelected).not.toHaveBeenCalled();
		});

		it('meters the microphone being tried, and the published one otherwise', () => {
			localMedia.microphone.enabled.set(true);
			micLevel.set(0.5);
			trial.microphone.level.set(1);
			expect(component.litLevelBars()).toBe(component.levelBars.length / 2);

			trial.microphone.device.set(headset);
			expect(component.litLevelBars()).toBe(component.levelBars.length);
		});
	});
});
