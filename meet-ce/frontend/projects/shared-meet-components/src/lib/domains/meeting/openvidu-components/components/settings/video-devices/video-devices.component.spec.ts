import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LoggerService } from '../../../../../../shared/services/logger.service';
import { CustomDevice } from '../../../models/device.model';
import { DeviceService } from '../../../services/device/device.service';
import { LocalMediaService } from '../../../services/local-media/local-media.service';
import { VideoDevicesComponent } from './video-devices.component';

class LoggerServiceStub {
	get() {
		return { d: () => {}, v: () => {}, w: () => {}, e: () => {} };
	}
}

describe('VideoDevicesComponent', () => {
	let component: VideoDevicesComponent;
	let localMedia: {
		setCameraEnabled: jasmine.Spy;
		switchCamera: jasmine.Spy;
		camera: { enabled: ReturnType<typeof signal<boolean>> };
	};
	let deviceService: jasmine.SpyObj<DeviceService>;

	const click = () => new MouseEvent('click');

	beforeEach(() => {
		localMedia = {
			setCameraEnabled: jasmine.createSpy('setCameraEnabled'),
			switchCamera: jasmine.createSpy('switchCamera'),
			camera: { enabled: signal(false) }
		};
		deviceService = Object.assign(jasmine.createSpyObj<DeviceService>('DeviceService', ['setCameraSelected']), {
			cameras: signal<CustomDevice[]>([]),
			cameraSelected: signal<CustomDevice | undefined>({ label: 'Webcam', device: 'cam-1' }),
			hasVideoDevices: signal(true)
		});

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				{ provide: LoggerService, useClass: LoggerServiceStub },
				{ provide: LocalMediaService, useValue: localMedia as unknown as LocalMediaService },
				{ provide: DeviceService, useValue: deviceService }
			]
		});
		TestBed.overrideComponent(VideoDevicesComponent, { set: { template: '', imports: [], styles: [] } });

		component = TestBed.createComponent(VideoDevicesComponent).componentInstance;
	});

	it('is ready for the next toggle when the camera could not be started', async () => {
		localMedia.setCameraEnabled.and.rejectWith(new Error('NotReadableError'));

		await expectAsync(component.toggleCam(click())).toBeResolved();

		expect(component.cameraStatusChanging()).toBeFalse();
	});

	it('does not announce a camera state that did not happen', async () => {
		const enabledChanges: boolean[] = [];
		component.onVideoEnabledChanged.subscribe((enabled) => enabledChanges.push(enabled));
		localMedia.setCameraEnabled.and.rejectWith(new Error('NotReadableError'));

		await component.toggleCam(click());

		expect(enabledChanges).toEqual([]);
	});

	it('keeps the current camera selected when the chosen one could not be opened', async () => {
		localMedia.switchCamera.and.rejectWith(new Error('NotReadableError'));

		await component.onCameraSelected({ value: { label: 'Other', device: 'cam-2' } });

		expect(deviceService.setCameraSelected).not.toHaveBeenCalled();
		expect(component.cameraStatusChanging()).toBeFalse();
	});
});
