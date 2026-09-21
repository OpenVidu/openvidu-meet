import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LoggerService } from '../../../../../../shared/services/logger.service';
import { CustomDevice } from '../../../models/device.model';
import { DeviceService } from '../../../services/device/device.service';
import { LocalMediaControlService } from '../../../services/local-media-control/local-media-control.service';
import { LocalMediaStateService } from '../../../services/local-media-state/local-media-state.service';
import { VideoDevicesComponent } from './video-devices.component';

class LoggerServiceStub {
	get() {
		return { d: () => {}, v: () => {}, w: () => {}, e: () => {} };
	}
}

describe('VideoDevicesComponent', () => {
	let component: VideoDevicesComponent;
	let localMediaControlService: jasmine.SpyObj<LocalMediaControlService>;
	let deviceService: jasmine.SpyObj<DeviceService>;

	const click = () => new MouseEvent('click');

	beforeEach(() => {
		localMediaControlService = jasmine.createSpyObj<LocalMediaControlService>('LocalMediaControlService', [
			'setCameraEnabled',
			'switchCamera'
		]);
		deviceService = Object.assign(
			jasmine.createSpyObj<DeviceService>('DeviceService', ['needUpdateVideoTrack', 'setCameraSelected']),
			{
				cameras: signal<CustomDevice[]>([]),
				cameraSelected: signal<CustomDevice | undefined>({ label: 'Webcam', device: 'cam-1' }),
				hasVideoDevices: signal(true)
			}
		);
		deviceService.needUpdateVideoTrack.and.returnValue(true);

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				{ provide: LoggerService, useClass: LoggerServiceStub },
				{ provide: LocalMediaControlService, useValue: localMediaControlService },
				{ provide: DeviceService, useValue: deviceService },
				{
					provide: LocalMediaStateService,
					useValue: { cameraEnabled: signal(false) } as unknown as LocalMediaStateService
				}
			]
		});
		TestBed.overrideComponent(VideoDevicesComponent, { set: { template: '', imports: [], styles: [] } });

		component = TestBed.createComponent(VideoDevicesComponent).componentInstance;
	});

	it('is ready for the next toggle when the camera could not be started', async () => {
		localMediaControlService.setCameraEnabled.and.rejectWith(new Error('NotReadableError'));

		await expectAsync(component.toggleCam(click())).toBeResolved();

		expect(component.cameraStatusChanging()).toBeFalse();
	});

	it('does not announce a camera state that did not happen', async () => {
		const enabledChanges: boolean[] = [];
		component.onVideoEnabledChanged.subscribe((enabled) => enabledChanges.push(enabled));
		localMediaControlService.setCameraEnabled.and.rejectWith(new Error('NotReadableError'));

		await component.toggleCam(click());

		expect(enabledChanges).toEqual([]);
	});

	it('keeps the current camera selected when the chosen one could not be opened', async () => {
		localMediaControlService.switchCamera.and.rejectWith(new Error('NotReadableError'));

		await component.onCameraSelected({ value: { label: 'Other', device: 'cam-2' } });

		expect(deviceService.setCameraSelected).not.toHaveBeenCalled();
		expect(component.cameraStatusChanging()).toBeFalse();
	});
});
