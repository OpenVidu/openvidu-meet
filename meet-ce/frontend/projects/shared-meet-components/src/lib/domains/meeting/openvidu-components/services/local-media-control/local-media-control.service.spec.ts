import { provideZonelessChangeDetection, signal, WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LoggerService } from '../../../../../shared/services/logger.service';
import { NotificationService } from '../../../../../shared/services/notification.service';
import { ParticipantModel } from '../../models/participant.model';
import { DeviceService } from '../device/device.service';
import { StreamLayoutStateService } from '../layout/stream-layout-state.service';
import { LocalVideoTrack, Track } from '../livekit';
import { LocalMediaIntentService } from '../local-media-intent/local-media-intent.service';
import { LocalTrackService } from '../local-track/local-track.service';
import { ParticipantService } from '../participant/participant.service';
import { CAMERA_CAPTURE_DEFAULTS, MICROPHONE_CAPTURE_DEFAULTS } from '../../models/media-capture.model';
import { CustomDevice } from '../../models/device.model';
import { LocalMediaControlService } from './local-media-control.service';

class LoggerServiceStub {
	get() {
		return { d: () => {}, v: () => {}, w: () => {}, e: () => {} };
	}
}

const deviceStillStarting = () => Object.assign(new Error('Timeout starting video source'), { name: 'AbortError' });
const deviceHeldByAnotherApp = () =>
	Object.assign(new Error('Could not start video source'), { name: 'NotReadableError' });

/** A published camera track, as far as a device switch needs to know it: the device it captures. */
const cameraTrackOn = (deviceId: string) =>
	({ mediaStreamTrack: { getSettings: () => ({ deviceId }) } }) as unknown as LocalVideoTrack;

/**
 * Runs an acquisition to completion under the mocked clock, releasing whatever timer it waits on.
 * An acquisition that backs off before trying the device again would otherwise never be let through.
 */
async function settle<T>(promise: Promise<T>): Promise<T> {
	let pending = true;

	void promise.then(
		() => (pending = false),
		() => (pending = false)
	);

	for (let i = 0; i < 50 && pending; i++) {
		await Promise.resolve();
		jasmine.clock().tick(50);
	}

	return promise;
}

describe('LocalMediaControlService', () => {
	let service: LocalMediaControlService;
	let localParticipant: WritableSignal<ParticipantModel | undefined>;
	let participant: jasmine.SpyObj<ParticipantModel>;
	let localTrackService: jasmine.SpyObj<LocalTrackService>;
	let deviceService: jasmine.SpyObj<DeviceService> & {
		cameraSelected: WritableSignal<CustomDevice | undefined>;
		microphoneSelected: WritableSignal<CustomDevice | undefined>;
	};
	let mediaIntent: LocalMediaIntentService;
	let notificationService: jasmine.SpyObj<NotificationService>;

	beforeEach(() => {
		localParticipant = signal<ParticipantModel | undefined>(undefined);
		participant = jasmine.createSpyObj<ParticipantModel>('ParticipantModel', [
			'setCameraEnabled',
			'setMicrophoneEnabled',
			'switchCamera',
			'switchMicrophone',
			'getCameraTrack',
			'getMicrophoneTrack',
			'bump'
		]);
		participant.setCameraEnabled.and.resolveTo(undefined);
		participant.setMicrophoneEnabled.and.resolveTo(undefined);
		participant.switchCamera.and.resolveTo();
		participant.switchMicrophone.and.resolveTo();
		participant.getCameraTrack.and.returnValue(undefined);
		participant.getMicrophoneTrack.and.returnValue(undefined);
		localTrackService = jasmine.createSpyObj<LocalTrackService>('LocalTrackService', [
			'setVideoTrackEnabled',
			'setAudioTrackEnabled',
			'switchCamera'
		]);
		localTrackService.setVideoTrackEnabled.and.resolveTo();
		localTrackService.setAudioTrackEnabled.and.resolveTo();
		localTrackService.switchCamera.and.resolveTo();
		deviceService = Object.assign(
			jasmine.createSpyObj<DeviceService>('DeviceService', ['syncDevicesAfterAcquisition']),
			{
				cameraSelected: signal<CustomDevice | undefined>(undefined),
				microphoneSelected: signal<CustomDevice | undefined>(undefined)
			}
		);
		deviceService.syncDevicesAfterAcquisition.and.resolveTo();
		notificationService = jasmine.createSpyObj<NotificationService>('NotificationService', ['showNotification']);

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				LocalMediaControlService,
				LocalMediaIntentService,
				{ provide: LoggerService, useClass: LoggerServiceStub },
				{ provide: LocalTrackService, useValue: localTrackService },
				{ provide: ParticipantService, useValue: { localParticipant } as unknown as ParticipantService },
				{ provide: DeviceService, useValue: deviceService },
				{ provide: StreamLayoutStateService, useValue: {} },
				{ provide: NotificationService, useValue: notificationService }
			]
		});

		service = TestBed.inject(LocalMediaControlService);
		mediaIntent = TestBed.inject(LocalMediaIntentService);
	});

	const cameraUnavailableNotice = () =>
		notificationService.showNotification.calls
			.allArgs()
			.some(([options]) => (options.message as { key: string }).key === 'ERRORS.CAMERA_UNAVAILABLE');

	describe('before the room is connected', () => {
		it('records the intent before touching the prejoin tracks', async () => {
			mediaIntent.setCameraEnabled(false);
			let intentWhileActing: boolean | undefined;
			localTrackService.setVideoTrackEnabled.and.callFake(async () => {
				intentWhileActing = mediaIntent.cameraEnabled();
			});

			await service.setCameraEnabled(true);

			expect(intentWhileActing).toBeTrue();
			expect(localTrackService.setVideoTrackEnabled).toHaveBeenCalledWith(true);
		});

		it('leaves reporting the acquisition to the prejoin tracks, so it is reported once', async () => {
			await service.setCameraEnabled(true);
			await service.setMicrophoneEnabled(true);

			expect(deviceService.syncDevicesAfterAcquisition).not.toHaveBeenCalled();
		});

		it('forgets an intent the camera could not fulfil', async () => {
			mediaIntent.setCameraEnabled(false);
			localTrackService.setVideoTrackEnabled.and.rejectWith(deviceHeldByAnotherApp());

			await expectAsync(service.setCameraEnabled(true)).toBeRejected();

			expect(mediaIntent.cameraEnabled()).toBeFalse();
		});

		it('tells the participant when the camera could not be started', async () => {
			localTrackService.setVideoTrackEnabled.and.rejectWith(deviceHeldByAnotherApp());

			await expectAsync(service.setCameraEnabled(true)).toBeRejected();

			expect(cameraUnavailableNotice()).toBeTrue();
		});

		it('tells the participant when the chosen camera could not be opened', async () => {
			localTrackService.switchCamera.and.rejectWith(deviceHeldByAnotherApp());

			await expectAsync(service.switchCamera('cam-2')).toBeRejected();

			expect(cameraUnavailableNotice()).toBeTrue();
		});
	});

	describe('once the room is connected', () => {
		beforeEach(() => {
			localParticipant.set(participant);
		});

		it('opens the default camera with the capture profile while none is selected', async () => {
			await service.setCameraEnabled(true);

			expect(participant.setCameraEnabled).toHaveBeenCalledWith(true, CAMERA_CAPTURE_DEFAULTS);
			expect(participant.bump).toHaveBeenCalled();
		});

		it('opens the selected devices, the same ones the prejoin would', async () => {
			deviceService.cameraSelected.set({ label: 'Webcam', device: 'cam-2' });
			deviceService.microphoneSelected.set({ label: 'Headset', device: 'mic-2' });

			await service.setCameraEnabled(true);
			await service.setMicrophoneEnabled(true);

			expect(participant.setCameraEnabled).toHaveBeenCalledWith(true, {
				...CAMERA_CAPTURE_DEFAULTS,
				deviceId: { exact: 'cam-2' }
			});
			expect(participant.setMicrophoneEnabled).toHaveBeenCalledWith(true, {
				...MICROPHONE_CAPTURE_DEFAULTS,
				deviceId: { exact: 'mic-2' }
			});
		});

		it('reports the camera acquisition after enabling it', async () => {
			await service.setCameraEnabled(true);

			expect(deviceService.syncDevicesAfterAcquisition).toHaveBeenCalledOnceWith([Track.Kind.Video]);
		});

		it('reports the microphone acquisition after enabling it', async () => {
			await service.setMicrophoneEnabled(true);

			expect(deviceService.syncDevicesAfterAcquisition).toHaveBeenCalledOnceWith([Track.Kind.Audio]);
		});

		it('reports the attempt even when the device could not be opened', async () => {
			const failure = new Error('NotFoundError');
			participant.setCameraEnabled.and.rejectWith(failure);

			await expectAsync(service.setCameraEnabled(true)).toBeRejectedWith(failure);

			expect(deviceService.syncDevicesAfterAcquisition).toHaveBeenCalledOnceWith([Track.Kind.Video]);
			expect(participant.bump).not.toHaveBeenCalled();
		});

		it('does not report anything when turning a device off', async () => {
			await service.setCameraEnabled(false);
			await service.setMicrophoneEnabled(false);

			expect(deviceService.syncDevicesAfterAcquisition).not.toHaveBeenCalled();
		});

		it('forgets an intent the camera could not fulfil', async () => {
			mediaIntent.setCameraEnabled(false);
			participant.setCameraEnabled.and.rejectWith(deviceHeldByAnotherApp());

			await expectAsync(service.setCameraEnabled(true)).toBeRejected();

			expect(mediaIntent.cameraEnabled()).toBeFalse();
		});

		it('does not insist on a camera another application holds, and says so', async () => {
			participant.setCameraEnabled.and.rejectWith(deviceHeldByAnotherApp());

			await expectAsync(service.setCameraEnabled(true)).toBeRejected();

			expect(participant.setCameraEnabled).toHaveBeenCalledTimes(1);
			expect(cameraUnavailableNotice()).toBeTrue();
		});

		it('says nothing when turning the camera on works', async () => {
			await service.setCameraEnabled(true);

			expect(notificationService.showNotification).not.toHaveBeenCalled();
		});

		describe('switching the camera', () => {
			beforeEach(() => {
				participant.getCameraTrack.and.returnValue(cameraTrackOn('cam-1'));
			});

			it('goes back to the current camera when the chosen one is held by another application', async () => {
				const failure = deviceHeldByAnotherApp();
				participant.switchCamera.and.callFake(async (deviceId: string) => {
					if (deviceId === 'cam-2') throw failure;
				});

				await expectAsync(service.switchCamera('cam-2')).toBeRejectedWith(failure);

				// livekit-client stops the current capture before opening the chosen device, and a
				// failed switch leaves the track pointed at the device that could not be opened.
				expect(participant.switchCamera.calls.allArgs()).toEqual([['cam-2'], ['cam-1']]);
				expect(participant.bump).toHaveBeenCalled();
				expect(cameraUnavailableNotice()).toBeTrue();
			});

			it('says nothing when the switch works', async () => {
				await service.switchCamera('cam-2');

				expect(participant.switchCamera).toHaveBeenCalledOnceWith('cam-2');
				expect(notificationService.showNotification).not.toHaveBeenCalled();
			});
		});

		// Windows + Chrome reject a camera request with AbortError ("Timeout starting video source")
		// while the OS is still releasing the device from its previous consumer; the very same request
		// succeeds a few hundred milliseconds later. Turning the camera off stops the capture to switch
		// the camera light off, so turning it back on is exactly that request.
		describe('a camera the OS has not finished releasing', () => {
			const RELEASE_MS = 300;

			let cameraFreeAt: number;

			beforeEach(() => {
				jasmine.clock().install();
				jasmine.clock().mockDate(new Date(0));
				cameraFreeAt = Date.now() + RELEASE_MS;

				const openCamera = async () => {
					if (Date.now() < cameraFreeAt) throw deviceStillStarting();
				};

				participant.setCameraEnabled.and.callFake(async (enabled: boolean) => {
					if (enabled) await openCamera();

					return undefined;
				});
				participant.switchCamera.and.callFake(openCamera);
			});

			afterEach(() => jasmine.clock().uninstall());

			it('turns the camera back on once the device is free', async () => {
				await settle(service.setCameraEnabled(true));

				expect(participant.bump).toHaveBeenCalled();
				expect(mediaIntent.cameraEnabled()).toBeTrue();
				expect(notificationService.showNotification).not.toHaveBeenCalled();
			});

			it('gives up, and says so, when the device never frees', async () => {
				cameraFreeAt = Infinity;

				await expectAsync(settle(service.setCameraEnabled(true))).toBeRejected();

				expect(participant.bump).not.toHaveBeenCalled();
				expect(cameraUnavailableNotice()).toBeTrue();
			});

			it('switches to the chosen camera once the device is free', async () => {
				participant.getCameraTrack.and.returnValue(cameraTrackOn('cam-1'));

				await settle(service.switchCamera('cam-2'));

				expect(participant.switchCamera.calls.allArgs()).toEqual([['cam-2'], ['cam-2']]);
				expect(notificationService.showNotification).not.toHaveBeenCalled();
			});
		});
	});
});
