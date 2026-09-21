import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LoggerService } from '../../../../../../shared/services/logger.service';
import { CustomDevice } from '../../../models/device.model';
import { DeviceService } from '../../../services/device/device.service';
import { LocalMediaControlService } from '../../../services/local-media-control/local-media-control.service';
import { LocalMediaStateService } from '../../../services/local-media-state/local-media-state.service';
import { AudioDevicesComponent } from './audio-devices.component';

class LoggerServiceStub {
	get() {
		return { d: () => {}, v: () => {}, w: () => {}, e: () => {} };
	}
}

describe('AudioDevicesComponent', () => {
	let component: AudioDevicesComponent;
	let localMediaControlService: jasmine.SpyObj<LocalMediaControlService>;

	beforeEach(() => {
		localMediaControlService = jasmine.createSpyObj<LocalMediaControlService>('LocalMediaControlService', [
			'setMicrophoneEnabled',
			'switchMicrophone'
		]);

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				{ provide: LoggerService, useClass: LoggerServiceStub },
				{ provide: LocalMediaControlService, useValue: localMediaControlService },
				{
					provide: DeviceService,
					useValue: {
						microphones: signal<CustomDevice[]>([]),
						microphoneSelected: signal<CustomDevice | undefined>(undefined),
						hasAudioDevices: signal(true)
					} as unknown as DeviceService
				},
				{
					provide: LocalMediaStateService,
					useValue: { microphoneEnabled: signal(false) } as unknown as LocalMediaStateService
				}
			]
		});
		TestBed.overrideComponent(AudioDevicesComponent, { set: { template: '', imports: [], styles: [] } });

		component = TestBed.createComponent(AudioDevicesComponent).componentInstance;
	});

	it('is ready for the next toggle when the microphone could not be started', async () => {
		localMediaControlService.setMicrophoneEnabled.and.rejectWith(new Error('NotReadableError'));

		await expectAsync(component.toggleMic(new MouseEvent('click'))).toBeResolved();

		expect(component.microphoneStatusChanging()).toBeFalse();
	});
});
