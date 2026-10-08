import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LoggerService } from '../../../../../../shared/services/logger.service';
import { CustomDevice } from '../../../models/device.model';
import { DeviceService } from '../../../services/device/device.service';
import { LocalMediaService } from '../../../services/local-media/local-media.service';
import { MicActivityService } from '../../../services/mic-activity/mic-activity.service';
import { AudioDevicesComponent } from './audio-devices.component';

class LoggerServiceStub {
	get() {
		return { d: () => {}, v: () => {}, w: () => {}, e: () => {} };
	}
}

describe('AudioDevicesComponent', () => {
	let component: AudioDevicesComponent;
	let localMedia: { setMicrophoneEnabled: jasmine.Spy; microphone: { enabled: ReturnType<typeof signal<boolean>> } };
	let micLevel: ReturnType<typeof signal<number>>;

	beforeEach(() => {
		localMedia = {
			setMicrophoneEnabled: jasmine.createSpy('setMicrophoneEnabled'),
			microphone: { enabled: signal(false) }
		};
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
						microphones: signal<CustomDevice[]>([]),
						microphoneSelected: signal<CustomDevice | undefined>(undefined),
						hasAudioDevices: signal(true)
					} as unknown as DeviceService
				}
			]
		});
		TestBed.overrideComponent(AudioDevicesComponent, { set: { template: '', imports: [], styles: [] } });

		component = TestBed.createComponent(AudioDevicesComponent).componentInstance;
	});

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
});
