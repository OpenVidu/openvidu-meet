import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LoggerService } from '../../../../../shared/services/logger.service';
import { CustomDevice } from '../../models/device.model';
import type { LocalTrack } from '../livekit';
import { Track } from '../livekit';
import { LivekitSdkService } from '../livekit/livekit-sdk.service';
import { PlatformService } from '../platform/platform.service';
import { MediaStorageService } from '../storage/storage.service';
import { DeviceService } from './device.service';

class LoggerServiceStub {
	get() {
		return { d: () => {}, v: () => {}, w: () => {}, e: () => {} };
	}
}

/**
 * What a browser reports before media permission is granted: the kinds are there, the labels and
 * ids are not. Indistinguishable from having no devices at all, which is the whole problem.
 */
const UNLABELLED_DEVICES = [
	{ kind: 'videoinput', label: '', deviceId: '', groupId: '' },
	{ kind: 'audioinput', label: '', deviceId: '', groupId: '' }
] as MediaDeviceInfo[];

const LABELLED_DEVICES = [
	{ kind: 'videoinput', label: 'Webcam', deviceId: 'cam-1', groupId: 'g1' },
	{ kind: 'audioinput', label: 'Headset', deviceId: 'mic-1', groupId: 'g2' }
] as MediaDeviceInfo[];

const camera = (deviceId: string): MediaDeviceInfo =>
	({ kind: 'videoinput', label: `Camera ${deviceId}`, deviceId, groupId: deviceId }) as MediaDeviceInfo;

/** A local track as LiveKit hands it back, capturing from the given device. */
const openedCamera = (deviceId: string): LocalTrack =>
	({ kind: Track.Kind.Video, mediaStreamTrack: { getSettings: () => ({ deviceId }) } }) as unknown as LocalTrack;

describe('DeviceService', () => {
	let service: DeviceService;
	let livekitSdkService: jasmine.SpyObj<LivekitSdkService>;
	let storedCamera: CustomDevice | undefined;

	beforeEach(() => {
		storedCamera = undefined;
		livekitSdkService = jasmine.createSpyObj<LivekitSdkService>('LivekitSdkService', ['getLocalDevices']);
		livekitSdkService.getLocalDevices.and.resolveTo(UNLABELLED_DEVICES);

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				DeviceService,
				{ provide: LoggerService, useClass: LoggerServiceStub },
				{ provide: PlatformService, useValue: { isMobile: () => false } as unknown as PlatformService },
				{
					provide: MediaStorageService,
					useValue: {
						getVideoDevice: () => storedCamera,
						getAudioDevice: () => undefined,
						setVideoDevice: () => {},
						setAudioDevice: () => {}
					} as unknown as MediaStorageService
				},
				{ provide: LivekitSdkService, useValue: livekitSdkService }
			]
		});

		service = TestBed.inject(DeviceService);
	});

	/**
	 * A room that starts with the microphone and camera off opens neither on entry, so nothing asks
	 * for media permission and the device lists stay empty. Read as "no devices", that empty list
	 * disables the very toggles that would have asked, so availability stays optimistic until a
	 * device has actually been opened, and only then is the list taken as the answer.
	 */
	describe('availability before anything has been opened', () => {
		it('offers the camera and microphone while an unlabelled device list is all there is', async () => {
			await service.initializeDevices();

			expect(service.cameras()).toEqual([]);
			expect(service.microphones()).toEqual([]);
			expect(service.hasVideoDevices()).toBe(true);
			expect(service.hasAudioDevices()).toBe(true);
		});

		it('reports the camera as unavailable once opening it left the list empty', async () => {
			await service.initializeDevices();
			await service.syncDevicesAfterAcquisition([Track.Kind.Video]);

			expect(service.hasVideoDevices()).toBe(false);
			// The microphone was not part of that attempt, so nothing is known about it yet.
			expect(service.hasAudioDevices()).toBe(true);
		});

		it('populates the device list from the labels that opening a device reveals', async () => {
			await service.initializeDevices();
			livekitSdkService.getLocalDevices.and.resolveTo(LABELLED_DEVICES);

			await service.syncDevicesAfterAcquisition([Track.Kind.Video, Track.Kind.Audio]);

			expect(service.cameras().map((c) => c.label)).toEqual(['Webcam']);
			expect(service.microphones().map((m) => m.label)).toEqual(['Headset']);
			expect(service.hasVideoDevices()).toBe(true);
			expect(service.hasAudioDevices()).toBe(true);
		});

		it('asks again on the next entry instead of carrying over what the last one found', async () => {
			await service.initializeDevices();
			await service.syncDevicesAfterAcquisition([Track.Kind.Video, Track.Kind.Audio]);
			expect(service.hasVideoDevices()).toBe(false);

			service.clear();

			expect(service.hasVideoDevices()).toBe(true);
			expect(service.hasAudioDevices()).toBe(true);
		});
	});

	/**
	 * The selection is aligned with the device the browser actually opened, which need not be the
	 * stored preference or the first in the list. A later re-enumeration (a hotplug, another
	 * acquisition) must not undo that alignment.
	 */
	describe('selection across refreshes', () => {
		beforeEach(async () => {
			livekitSdkService.getLocalDevices.and.resolveTo([camera('cam-1'), camera('cam-2'), camera('cam-3')]);
			await service.initializeDevices();
		});

		it('starts on the stored preference, or the first camera without one', async () => {
			expect(service.cameraSelected()?.device).toBe('cam-1');

			storedCamera = { label: 'Camera cam-2', device: 'cam-2' };
			await service.initializeDevices();

			expect(service.cameraSelected()?.device).toBe('cam-2');
		});

		it('keeps the camera that was actually opened when the list is refreshed', async () => {
			await service.syncDevicesAfterAcquisition([Track.Kind.Video], [openedCamera('cam-3')]);
			expect(service.cameraSelected()?.device).toBe('cam-3');

			await service.refreshDevices();

			expect(service.cameraSelected()?.device).toBe('cam-3');
		});

		it('falls back to the stored preference when the selected camera is unplugged', async () => {
			storedCamera = { label: 'Camera cam-2', device: 'cam-2' };
			await service.syncDevicesAfterAcquisition([Track.Kind.Video], [openedCamera('cam-3')]);

			livekitSdkService.getLocalDevices.and.resolveTo([camera('cam-1'), camera('cam-2')]);
			await service.refreshDevices();

			expect(service.cameraSelected()?.device).toBe('cam-2');
		});

		it('drops the selection when no camera is left', async () => {
			livekitSdkService.getLocalDevices.and.resolveTo([]);
			await service.refreshDevices();

			expect(service.cameraSelected()).toBeUndefined();
		});
	});
});
