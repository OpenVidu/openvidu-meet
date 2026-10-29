import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LoggerService } from '../../../../../shared/services/logger.service';
import { CustomDevice } from '../../models/device.model';
import { CAMERA_CAPTURE_DEFAULTS, MICROPHONE_CAPTURE_DEFAULTS } from '../../models/media-capture.model';
import { DeviceService } from '../device/device.service';
import type { CreateLocalTracksOptions, LocalTrack } from '../livekit';
import { Track } from '../livekit';
import { LivekitSdkService } from '../livekit/livekit-sdk.service';
import { LocalMediaService } from '../local-media/local-media.service';
import { DeviceTrialService } from './device-trial.service';

class LoggerServiceStub {
	get() {
		return { d: () => {}, v: () => {}, w: () => {}, e: () => {} };
	}
}

const front: CustomDevice = { label: 'Front', device: 'cam-front' };
const back: CustomDevice = { label: 'Back', device: 'cam-back' };
const side: CustomDevice = { label: 'Side', device: 'cam-side' };
const laptop: CustomDevice = { label: 'Laptop', device: 'mic-laptop' };
const headset: CustomDevice = { label: 'Headset', device: 'mic-headset' };

/** A capture opened to try a device: records whether it was closed and detached. */
interface FakeCapture {
	kind: Track.Kind;
	deviceId: string;
	stopped: boolean;
	detached: boolean;
	mediaStreamTrack: MediaStreamTrack;
	stop(): void;
	detach(): void;
}

let audioContext: AudioContext;

function fakeCapture(kind: Track.Kind, deviceId: string): FakeCapture {
	const mediaStreamTrack =
		kind === Track.Kind.Audio
			? audioTrack()
			: ({ stop: () => {}, readyState: 'live' } as unknown as MediaStreamTrack);

	return {
		kind,
		deviceId,
		stopped: false,
		detached: false,
		mediaStreamTrack,
		stop() {
			this.stopped = true;
			this.mediaStreamTrack.stop();
		},
		detach() {
			this.detached = true;
		}
	};
}

/** A live, loud audio capture, so the meter of a tried microphone has something to read. */
function audioTrack(): MediaStreamTrack {
	const oscillator = audioContext.createOscillator();
	const destination = audioContext.createMediaStreamDestination();
	oscillator.connect(destination);
	oscillator.start();
	return destination.stream.getAudioTracks()[0];
}

const requestedDeviceId = (options: CreateLocalTracksOptions): string => {
	const capture = (options.video || options.audio) as { deviceId?: { exact?: string } };
	return capture.deviceId!.exact!;
};

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

async function waitFor(condition: () => boolean, timeoutMs = 3000): Promise<void> {
	const deadline = performance.now() + timeoutMs;

	while (!condition()) {
		if (performance.now() > deadline) throw new Error('Condition not met in time');

		await new Promise((resolve) => setTimeout(resolve, 20));
	}
}

describe('DeviceTrialService', () => {
	let service: DeviceTrialService;
	let opened: FakeCapture[];
	let openRequests: CreateLocalTracksOptions[];
	let openDevice: jasmine.Spy<(options: CreateLocalTracksOptions) => Promise<LocalTrack[]>>;
	let events: string[];
	let localMedia: {
		camera: { enabled: ReturnType<typeof signal<boolean>> };
		microphone: { enabled: ReturnType<typeof signal<boolean>> };
		switchCamera: jasmine.Spy;
		switchMicrophone: jasmine.Spy;
		reportUnavailable: jasmine.Spy;
	};
	let deviceService: {
		cameras: ReturnType<typeof signal<CustomDevice[]>>;
		microphones: ReturnType<typeof signal<CustomDevice[]>>;
		cameraSelected: ReturnType<typeof signal<CustomDevice | undefined>>;
		microphoneSelected: ReturnType<typeof signal<CustomDevice | undefined>>;
		setCameraSelected: jasmine.Spy;
		setMicSelected: jasmine.Spy;
	};

	beforeEach(() => {
		audioContext = new AudioContext();
		opened = [];
		openRequests = [];
		events = [];

		openDevice = jasmine.createSpy('createLocalTracks').and.callFake(async (options: CreateLocalTracksOptions) => {
			openRequests.push(options);
			const capture = fakeCapture(
				options.video ? Track.Kind.Video : Track.Kind.Audio,
				requestedDeviceId(options)
			);
			opened.push(capture);
			return [capture as unknown as LocalTrack];
		});

		localMedia = {
			camera: { enabled: signal(true) },
			microphone: { enabled: signal(true) },
			switchCamera: jasmine.createSpy('switchCamera').and.callFake(async (id: string) => {
				events.push(`switch camera ${id}`);
			}),
			switchMicrophone: jasmine.createSpy('switchMicrophone').and.callFake(async (id: string) => {
				events.push(`switch microphone ${id}`);
			}),
			reportUnavailable: jasmine.createSpy('reportUnavailable')
		};

		deviceService = {
			cameras: signal([front, back, side]),
			microphones: signal([laptop, headset]),
			cameraSelected: signal<CustomDevice | undefined>(front),
			microphoneSelected: signal<CustomDevice | undefined>(laptop),
			setCameraSelected: jasmine.createSpy('setCameraSelected').and.callFake((id: string) => {
				deviceService.cameraSelected.set(deviceService.cameras().find((camera) => camera.device === id));
			}),
			setMicSelected: jasmine.createSpy('setMicSelected').and.callFake((id: string) => {
				deviceService.microphoneSelected.set(deviceService.microphones().find((mic) => mic.device === id));
			})
		};

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				DeviceTrialService,
				{ provide: LoggerService, useClass: LoggerServiceStub },
				{ provide: LivekitSdkService, useValue: { createLocalTracks: openDevice } },
				{ provide: LocalMediaService, useValue: localMedia as unknown as LocalMediaService },
				{ provide: DeviceService, useValue: deviceService as unknown as DeviceService }
			]
		});

		service = TestBed.inject(DeviceTrialService);
	});

	afterEach(async () => {
		service.ngOnDestroy();
		opened.forEach((capture) => capture.mediaStreamTrack.stop());
		await audioContext.close();
	});

	describe('trying a device', () => {
		it('opens one capture of the picked camera with the camera profile, and nothing else', async () => {
			await service.tryCamera(back);

			expect(openRequests).toEqual([
				{ video: { ...CAMERA_CAPTURE_DEFAULTS, deviceId: { exact: 'cam-back' } }, audio: false }
			]);
			expect(service.camera.device()).toEqual(back);
			expect(service.camera.track() as unknown).toBe(opened[0]);
			expect(service.pending()).toBeTrue();
			expect(localMedia.switchCamera).not.toHaveBeenCalled();
			expect(deviceService.setCameraSelected).not.toHaveBeenCalled();
		});

		it('opens a picked microphone with the microphone profile and measures it', async () => {
			await service.tryMicrophone(headset);

			expect(openRequests).toEqual([
				{ video: false, audio: { ...MICROPHONE_CAPTURE_DEFAULTS, deviceId: { exact: 'mic-headset' } } }
			]);
			await waitFor(() => service.microphone.level() > 0);
		});

		it('does not open the published device when it is picked', async () => {
			await service.tryCamera(front);

			expect(openDevice).not.toHaveBeenCalled();
			expect(service.pending()).toBeFalse();
		});

		it('closes the tried capture when the published device is picked back', async () => {
			await service.tryCamera(back);
			await service.tryCamera(front);

			expect(opened.length).toBe(1);
			expect(opened[0].stopped).toBeTrue();
			expect(opened[0].detached).toBeTrue();
			expect(service.camera.track()).toBeUndefined();
			expect(service.pending()).toBeFalse();
		});

		it('closes the previous capture when another device is picked', async () => {
			await service.tryCamera(back);
			await service.tryCamera(side);

			expect(opened.map((capture) => [capture.deviceId, capture.stopped])).toEqual([
				['cam-back', true],
				['cam-side', false]
			]);
			expect(service.camera.device()).toEqual(side);
		});

		it('closes a capture that arrives after a newer pick, keeping the newer one', async () => {
			const slow = deferred<LocalTrack[]>();
			const late = fakeCapture(Track.Kind.Video, 'cam-back');
			openDevice.and.returnValues(
				slow.promise,
				Promise.resolve([fakeCapture(Track.Kind.Video, 'cam-side')] as unknown as LocalTrack[])
			);

			const first = service.tryCamera(back);
			await service.tryCamera(side);
			slow.resolve([late as unknown as LocalTrack]);
			await first;

			expect(late.stopped).toBeTrue();
			expect(service.camera.device()).toEqual(side);
			expect((service.camera.track() as unknown as FakeCapture).deviceId).toBe('cam-side');
		});

		it('drops the pick and tells the participant when the device cannot be opened', async () => {
			openDevice.and.rejectWith(
				Object.assign(new Error('Could not start video source'), { name: 'NotReadableError' })
			);

			await expectAsync(service.tryCamera(back)).toBeResolved();

			expect(service.pending()).toBeFalse();
			expect(service.camera.device()).toBeUndefined();
			expect(localMedia.reportUnavailable).toHaveBeenCalledOnceWith(Track.Kind.Video);
		});

		it('keeps the newer pick when an older one fails afterwards', async () => {
			const slow = deferred<LocalTrack[]>();
			openDevice.and.returnValues(
				slow.promise,
				Promise.resolve([fakeCapture(Track.Kind.Video, 'cam-side')] as unknown as LocalTrack[])
			);

			const first = service.tryCamera(back);
			await service.tryCamera(side);
			slow.reject(new Error('NotReadableError'));
			await first;

			expect(service.camera.device()).toEqual(side);
			expect(service.camera.track()).toBeDefined();
		});
	});

	describe('discarding', () => {
		it('drops only the camera pick when the camera is turned off', async () => {
			await service.tryCamera(back);
			await service.tryMicrophone(headset);

			localMedia.camera.enabled.set(false);
			TestBed.tick();

			expect(service.camera.device()).toBeUndefined();
			expect(opened[0].stopped).toBeTrue();
			expect(service.microphone.device()).toEqual(headset);
			expect(opened[1].stopped).toBeFalse();
			expect(service.pending()).toBeTrue();
		});

		it('drops the pick of a device that is unplugged', async () => {
			await service.tryCamera(back);

			deviceService.cameras.set([front, side]);
			TestBed.tick();

			expect(service.camera.device()).toBeUndefined();
			expect(opened[0].stopped).toBeTrue();
		});

		it('keeps the pick while another device is unplugged', async () => {
			await service.tryCamera(back);

			deviceService.cameras.set([front, back]);
			TestBed.tick();

			expect(service.camera.device()).toEqual(back);
		});

		it('releases the capture its meter measures when a tried microphone is dropped', async () => {
			const clones = spyOn(MediaStreamTrack.prototype, 'clone').and.callThrough();
			await service.tryMicrophone(headset);
			const meterCapture = clones.calls.mostRecent().returnValue;

			await service.tryMicrophone(laptop);

			expect(opened[0].stopped).toBeTrue();
			await waitFor(() => meterCapture.readyState === 'ended');
			expect(service.microphone.level()).toBe(0);
		});

		it('closes every tried capture, and one still opening, when it is destroyed', async () => {
			const slow = deferred<LocalTrack[]>();
			const late = fakeCapture(Track.Kind.Video, 'cam-side');
			const clones = spyOn(MediaStreamTrack.prototype, 'clone').and.callThrough();
			await service.tryMicrophone(headset);
			const meterCapture = clones.calls.mostRecent().returnValue;
			await service.tryCamera(back);
			openDevice.and.returnValue(slow.promise);
			const opening = service.tryCamera(side);

			service.ngOnDestroy();
			slow.resolve([late as unknown as LocalTrack]);
			await opening;

			expect(opened.every((capture) => capture.stopped)).toBeTrue();
			expect(late.stopped).toBeTrue();
			await waitFor(() => meterCapture.readyState === 'ended');
			expect(service.microphone.level()).toBe(0);
			expect(service.pending()).toBeFalse();
		});
	});

	describe('applying', () => {
		it('closes each tried capture before switching the published device, then remembers it', async () => {
			await service.tryCamera(back);
			await service.tryMicrophone(headset);
			opened.forEach((capture) => {
				const stop = capture.stop.bind(capture);

				capture.stop = () => {
					events.push(`stop ${capture.deviceId}`);
					stop();
				};
			});

			const applied = await service.apply();

			expect(events).toEqual([
				'stop cam-back',
				'switch camera cam-back',
				'stop mic-headset',
				'switch microphone mic-headset'
			]);
			expect(deviceService.setCameraSelected).toHaveBeenCalledOnceWith('cam-back');
			expect(deviceService.setMicSelected).toHaveBeenCalledOnceWith('mic-headset');
			expect(applied).toEqual({ camera: back, microphone: headset });
			expect(service.pending()).toBeFalse();
			expect(service.applying()).toBeFalse();
		});

		it('reports that it is applying until the switch is done', async () => {
			const switching = deferred<void>();
			localMedia.switchCamera.and.returnValue(switching.promise);
			await service.tryCamera(back);

			const applying = service.apply();
			expect(service.applying()).toBeTrue();

			switching.resolve();
			await applying;
			expect(service.applying()).toBeFalse();
		});

		it('does not remember a device that could not be switched to', async () => {
			localMedia.switchCamera.and.rejectWith(new Error('NotReadableError'));
			await service.tryCamera(back);
			await service.tryMicrophone(headset);

			const applied = await service.apply();

			expect(deviceService.setCameraSelected).not.toHaveBeenCalled();
			expect(deviceService.cameraSelected()).toEqual(front);
			expect(applied).toEqual({ camera: undefined, microphone: headset });
			expect(service.pending()).toBeFalse();
		});

		it('switches only the devices that were picked', async () => {
			await service.tryMicrophone(headset);

			const applied = await service.apply();

			expect(localMedia.switchCamera).not.toHaveBeenCalled();
			expect(applied).toEqual({ camera: undefined, microphone: headset });
		});

		it('closes a capture still opening when the pick is applied', async () => {
			const slow = deferred<LocalTrack[]>();
			const late = fakeCapture(Track.Kind.Video, 'cam-back');
			openDevice.and.returnValue(slow.promise);
			const opening = service.tryCamera(back);

			await service.apply();
			slow.resolve([late as unknown as LocalTrack]);
			await opening;

			expect(localMedia.switchCamera).toHaveBeenCalledOnceWith('cam-back');
			expect(late.stopped).toBeTrue();
			expect(service.camera.track()).toBeUndefined();
		});
	});
});
