import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LoggerService } from '../../../../../../shared/services/logger.service';
import { CustomDevice } from '../../../models/device.model';
import { DeviceService } from '../../../services/device/device.service';
import { DeviceTrialService } from '../../../services/device-trial/device-trial.service';
import { MeetingUiConfigService } from '../../../services/config/meeting-ui-config.service';
import { LocalMediaService } from '../../../services/local-media/local-media.service';
import { PanelService } from '../../../services/panel/panel.service';
import { ParticipantService } from '../../../services/participant/participant.service';
import { VirtualBackgroundService } from '../../../services/virtual-background/virtual-background.service';
import { VideoDevicesComponent } from './video-devices.component';

class LoggerServiceStub {
	get() {
		return { d: () => {}, v: () => {}, w: () => {}, e: () => {} };
	}
}

const webcam: CustomDevice = { label: 'Webcam', device: 'cam-1' };
const other: CustomDevice = { label: 'Other', device: 'cam-2' };

describe('VideoDevicesComponent', () => {
	let component: VideoDevicesComponent;
	let localMedia: {
		setCameraEnabled: jasmine.Spy;
		switchCamera: jasmine.Spy;
		camera: { enabled: ReturnType<typeof signal<boolean>>; track: ReturnType<typeof signal<unknown>> };
	};
	let deviceService: jasmine.SpyObj<DeviceService>;
	let backgroundApplied: ReturnType<typeof signal<boolean>>;

	const click = () => new MouseEvent('click');

	function create(trial?: unknown) {
		localMedia = {
			setCameraEnabled: jasmine.createSpy('setCameraEnabled'),
			switchCamera: jasmine.createSpy('switchCamera'),
			camera: { enabled: signal(false), track: signal<unknown>({ id: 'published' }) }
		};
		deviceService = Object.assign(jasmine.createSpyObj<DeviceService>('DeviceService', ['setCameraSelected']), {
			cameras: signal<CustomDevice[]>([webcam, other]),
			cameraSelected: signal<CustomDevice | undefined>(webcam),
			hasVideoDevices: signal(true)
		});
		backgroundApplied = signal(false);

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				{ provide: LoggerService, useClass: LoggerServiceStub },
				{ provide: LocalMediaService, useValue: localMedia as unknown as LocalMediaService },
				{ provide: DeviceService, useValue: deviceService },
				{ provide: PanelService, useValue: {} },
				{ provide: ParticipantService, useValue: { localParticipant: signal(undefined) } },
				{ provide: MeetingUiConfigService, useValue: { backgroundEffectsButtonSignal: signal(false) } },
				{ provide: VirtualBackgroundService, useValue: { isBackgroundApplied: () => backgroundApplied() } },
				...(trial ? [{ provide: DeviceTrialService, useValue: trial }] : [])
			]
		});
		TestBed.overrideComponent(VideoDevicesComponent, { set: { template: '', imports: [], styles: [] } });

		component = TestBed.createComponent(VideoDevicesComponent).componentInstance;
	}

	describe('on the device setup screen', () => {
		beforeEach(() => create());

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

		it('switches the camera at once when one is picked', async () => {
			await component.onCameraSelected({ value: other });

			expect(localMedia.switchCamera).toHaveBeenCalledOnceWith('cam-2');
			expect(deviceService.setCameraSelected).toHaveBeenCalledOnceWith('cam-2');
		});

		it('keeps the current camera selected when the chosen one could not be opened', async () => {
			localMedia.switchCamera.and.rejectWith(new Error('NotReadableError'));

			await component.onCameraSelected({ value: other });

			expect(deviceService.setCameraSelected).not.toHaveBeenCalled();
			expect(component.cameraStatusChanging()).toBeFalse();
		});
	});

	describe('in the meeting settings', () => {
		let trial: {
			tryCamera: jasmine.Spy;
			camera: {
				device: ReturnType<typeof signal<CustomDevice | undefined>>;
				track: ReturnType<typeof signal<unknown>>;
			};
			applying: ReturnType<typeof signal<boolean>>;
		};

		beforeEach(() => {
			trial = {
				tryCamera: jasmine.createSpy('tryCamera'),
				camera: { device: signal<CustomDevice | undefined>(undefined), track: signal<unknown>(undefined) },
				applying: signal(false)
			};
			create(trial);
		});

		it('tries a picked camera without switching the published one', async () => {
			const changes: CustomDevice[] = [];
			component.onVideoDeviceChanged.subscribe((device) => changes.push(device));

			await component.onCameraSelected({ value: other });

			expect(trial.tryCamera).toHaveBeenCalledOnceWith(other);
			expect(localMedia.switchCamera).not.toHaveBeenCalled();
			expect(deviceService.setCameraSelected).not.toHaveBeenCalled();
			expect(changes).toEqual([]);
		});

		it('previews the camera being tried, and the published one otherwise', () => {
			expect(component.videoTrack() as unknown).toEqual({ id: 'published' });

			trial.camera.device.set(other);
			trial.camera.track.set({ id: 'tried' });

			expect(component.videoTrack() as unknown).toEqual({ id: 'tried' });
		});

		it('hints that the background effect comes with the camera once applied', () => {
			backgroundApplied.set(true);
			expect(component.showEffectHint()).toBeFalse();

			trial.camera.device.set(other);
			expect(component.showEffectHint()).toBeTrue();

			backgroundApplied.set(false);
			expect(component.showEffectHint()).toBeFalse();
		});
	});
});
