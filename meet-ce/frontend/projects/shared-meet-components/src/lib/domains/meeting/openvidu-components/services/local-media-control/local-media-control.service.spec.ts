import { provideZonelessChangeDetection, signal, WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LoggerService } from '../../../../../shared/services/logger.service';
import { ParticipantModel } from '../../models/participant.model';
import { DeviceService } from '../device/device.service';
import { StreamLayoutStateService } from '../layout/stream-layout-state.service';
import { Track } from '../livekit';
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

describe('LocalMediaControlService', () => {
	let service: LocalMediaControlService;
	let localParticipant: WritableSignal<ParticipantModel | undefined>;
	let participant: jasmine.SpyObj<ParticipantModel>;
	let localTrackService: jasmine.SpyObj<LocalTrackService>;
	let deviceService: jasmine.SpyObj<DeviceService> & {
		cameraSelected: WritableSignal<CustomDevice | undefined>;
		microphoneSelected: WritableSignal<CustomDevice | undefined>;
	};
	let mediaIntent: jasmine.SpyObj<LocalMediaIntentService>;

	beforeEach(() => {
		localParticipant = signal<ParticipantModel | undefined>(undefined);
		participant = jasmine.createSpyObj<ParticipantModel>('ParticipantModel', [
			'setCameraEnabled',
			'setMicrophoneEnabled',
			'bump'
		]);
		participant.setCameraEnabled.and.resolveTo(undefined);
		participant.setMicrophoneEnabled.and.resolveTo(undefined);
		localTrackService = jasmine.createSpyObj<LocalTrackService>('LocalTrackService', [
			'setVideoTrackEnabled',
			'setAudioTrackEnabled'
		]);
		localTrackService.setVideoTrackEnabled.and.resolveTo();
		localTrackService.setAudioTrackEnabled.and.resolveTo();
		deviceService = Object.assign(
			jasmine.createSpyObj<DeviceService>('DeviceService', ['syncDevicesAfterAcquisition']),
			{
				cameraSelected: signal<CustomDevice | undefined>(undefined),
				microphoneSelected: signal<CustomDevice | undefined>(undefined)
			}
		);
		deviceService.syncDevicesAfterAcquisition.and.resolveTo();
		mediaIntent = jasmine.createSpyObj<LocalMediaIntentService>('LocalMediaIntentService', [
			'setCameraEnabled',
			'setMicrophoneEnabled'
		]);

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				LocalMediaControlService,
				{ provide: LoggerService, useClass: LoggerServiceStub },
				{ provide: LocalTrackService, useValue: localTrackService },
				{ provide: ParticipantService, useValue: { localParticipant } as unknown as ParticipantService },
				{ provide: DeviceService, useValue: deviceService },
				{ provide: StreamLayoutStateService, useValue: {} },
				{ provide: LocalMediaIntentService, useValue: mediaIntent }
			]
		});

		service = TestBed.inject(LocalMediaControlService);
	});

	describe('before the room is connected', () => {
		it('records the intent before touching the prejoin tracks', async () => {
			await service.setCameraEnabled(true);

			expect(mediaIntent.setCameraEnabled).toHaveBeenCalledBefore(localTrackService.setVideoTrackEnabled);
			expect(localTrackService.setVideoTrackEnabled).toHaveBeenCalledWith(true);
		});

		it('leaves reporting the acquisition to the prejoin tracks, so it is reported once', async () => {
			await service.setCameraEnabled(true);
			await service.setMicrophoneEnabled(true);

			expect(deviceService.syncDevicesAfterAcquisition).not.toHaveBeenCalled();
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
	});
});
