import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LoggerService } from '../../../../../../shared/services/logger.service';
import { CustomDevice } from '../../../models/device.model';
import { DeviceService } from '../../../services/device/device.service';
import { LocalMediaService } from '../../../services/local-media/local-media.service';
import { AudioDevicesComponent } from './audio-devices.component';

class LoggerServiceStub {
	get() {
		return { d: () => {}, v: () => {}, w: () => {}, e: () => {} };
	}
}

describe('AudioDevicesComponent', () => {
	let component: AudioDevicesComponent;
	let localMedia: { setMicrophoneEnabled: jasmine.Spy; microphone: { enabled: ReturnType<typeof signal<boolean>> } };

	beforeEach(() => {
		localMedia = {
			setMicrophoneEnabled: jasmine.createSpy('setMicrophoneEnabled'),
			microphone: { enabled: signal(false) }
		};

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				{ provide: LoggerService, useClass: LoggerServiceStub },
				{ provide: LocalMediaService, useValue: localMedia as unknown as LocalMediaService },
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
});
