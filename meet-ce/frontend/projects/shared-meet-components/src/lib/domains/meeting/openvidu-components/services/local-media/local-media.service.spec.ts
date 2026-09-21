import { provideZonelessChangeDetection, signal, WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LoggerService } from '../../../../../shared/services/logger.service';
import { NotificationService } from '../../../../../shared/services/notification.service';
import { CustomDevice } from '../../models/device.model';
import { CAMERA_CAPTURE_DEFAULTS, MICROPHONE_CAPTURE_DEFAULTS } from '../../models/media-capture.model';
import type { ParticipantModel } from '../../models/participant.model';
import { DeviceService } from '../device/device.service';
import type {
	AudioCaptureOptions,
	LocalAudioTrack,
	LocalTrack,
	LocalVideoTrack,
	VideoCaptureOptions
} from '../livekit';
import { Track } from '../livekit';
import { LivekitSdkService } from '../livekit/livekit-sdk.service';
import { VideoTrackProcessorService } from '../track-processor/video-track-processor.service';
import { LocalMediaService } from './local-media.service';

class LoggerServiceStub {
	get() {
		return { d: () => {}, v: () => {}, w: () => {}, e: () => {} };
	}
}

type Listener = (track: unknown) => void;

class FakeMediaStreamTrack {
	enabled = true;
	readyState: 'live' | 'ended' = 'live';

	constructor(readonly deviceId: string) {}

	getSettings(): { deviceId: string } {
		return { deviceId: this.deviceId };
	}

	stop(): void {
		this.readyState = 'ended';
	}
}

/**
 * Stand-in for a LiveKit local track, with the behaviour the owner relies on: mute/unmute and a
 * restart flip state on the same object and announce it through the track's own events, the
 * current capture is stopped before a device is opened, and opening a device can fail like
 * `getUserMedia`.
 */
class FakeLocalTrack {
	isMuted = false;
	stopped = false;
	mediaStreamTrack: FakeMediaStreamTrack;
	/** Constraints each restartTrack() was asked for, so a device switch can be inspected. */
	readonly restartOptions: Array<VideoCaptureOptions | AudioCaptureOptions | undefined> = [];
	/** Stands for the browser opening the device: throws like `getUserMedia` for a device it cannot open. */
	openDevice: (deviceId: string) => void = () => {};
	private readonly listeners = new Map<string, Set<Listener>>();

	constructor(
		readonly kind: Track.Kind,
		deviceId = `${kind}-1`
	) {
		this.mediaStreamTrack = new FakeMediaStreamTrack(deviceId);
	}

	on(event: string, listener: Listener): this {
		this.listeners.set(event, (this.listeners.get(event) ?? new Set()).add(listener));
		return this;
	}

	off(event: string, listener: Listener): this {
		this.listeners.get(event)?.delete(listener);
		return this;
	}

	async mute(): Promise<void> {
		if (this.isMuted) return;

		this.mediaStreamTrack.stop();
		this.isMuted = true;
		this.emit('muted');
	}

	async unmute(): Promise<void> {
		if (!this.isMuted) return;

		this.reopen(this.mediaStreamTrack.deviceId);
		this.isMuted = false;
		this.emit('unmuted');
	}

	async restartTrack(options?: VideoCaptureOptions | AudioCaptureOptions): Promise<void> {
		this.restartOptions.push(options);
		this.reopen(requestedDevice(options) ?? this.mediaStreamTrack.deviceId);
	}

	stop(): void {
		this.stopped = true;
		this.mediaStreamTrack.stop();
	}

	detach(): void {}

	/** The device went away under the track, as when it is unplugged. */
	end(): void {
		this.mediaStreamTrack.stop();
		this.emit('ended');
	}

	private reopen(deviceId: string): void {
		this.mediaStreamTrack.stop();
		this.openDevice(deviceId);
		this.mediaStreamTrack = new FakeMediaStreamTrack(deviceId);
		this.emit('restarted');
	}

	private emit(event: string): void {
		this.listeners.get(event)?.forEach((listener) => listener(this));
	}
}

const requestedDevice = (options?: VideoCaptureOptions | AudioCaptureOptions | boolean): string | undefined => {
	const constraint = (options as { deviceId?: { exact?: string; ideal?: string } } | undefined)?.deviceId;
	return constraint?.exact ?? constraint?.ideal;
};

const deviceStillStarting = () => Object.assign(new Error('Timeout starting video source'), { name: 'AbortError' });
const deviceHeldByAnotherApp = () =>
	Object.assign(new Error('Could not start video source'), { name: 'NotReadableError' });
const permissionDenied = () => Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });

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

describe('LocalMediaService', () => {
	let service: LocalMediaService;
	let audio: FakeLocalTrack;
	let video: FakeLocalTrack;
	let hasVideoDevices: WritableSignal<boolean>;
	let hasAudioDevices: WritableSignal<boolean>;
	let cameraSelected: WritableSignal<CustomDevice | undefined>;
	let syncDevicesAfterAcquisition: jasmine.Spy;
	let applyToVideoTrack: jasmine.Spy;
	let livekitSdkService: jasmine.SpyObj<LivekitSdkService>;
	let notificationService: jasmine.SpyObj<NotificationService>;
	let participant: { publishTrack: jasmine.Spy; bump: jasmine.Spy };

	const asTrack = (track: FakeLocalTrack) => track as unknown as LocalTrack;
	const asCamera = (track: FakeLocalTrack) => track as unknown as LocalVideoTrack;
	const asMicrophone = (track: FakeLocalTrack) => track as unknown as LocalAudioTrack;
	const asParticipant = () => participant as unknown as ParticipantModel;
	const videoRequest = (index = 0) =>
		livekitSdkService.createLocalTracks.calls.argsFor(index)[0].video as VideoCaptureOptions;
	const audioRequest = (index = 0) =>
		livekitSdkService.createLocalTracks.calls.argsFor(index)[0].audio as AudioCaptureOptions;
	const cameraUnavailableNotice = () =>
		notificationService.showNotification.calls
			.allArgs()
			.some(([options]) => (options.message as { key: string }).key === 'ERRORS.CAMERA_UNAVAILABLE');

	beforeEach(() => {
		audio = new FakeLocalTrack(Track.Kind.Audio);
		video = new FakeLocalTrack(Track.Kind.Video);
		hasVideoDevices = signal(true);
		hasAudioDevices = signal(true);
		cameraSelected = signal<CustomDevice | undefined>(undefined);
		syncDevicesAfterAcquisition = jasmine.createSpy('syncDevicesAfterAcquisition').and.resolveTo();
		applyToVideoTrack = jasmine.createSpy('applyToVideoTrack').and.resolveTo();
		participant = {
			publishTrack: jasmine.createSpy('publishTrack').and.resolveTo(),
			bump: jasmine.createSpy('bump')
		};
		notificationService = jasmine.createSpyObj<NotificationService>('NotificationService', ['showNotification']);
		livekitSdkService = jasmine.createSpyObj<LivekitSdkService>('LivekitSdkService', ['createLocalTracks']);
		// The browser: hands over a track per requested kind, unless opening that device fails.
		livekitSdkService.createLocalTracks.and.callFake(async (options) => {
			const tracks: LocalTrack[] = [];

			if (options.video) {
				video.openDevice(requestedDevice(options.video) ?? video.mediaStreamTrack.deviceId);
				tracks.push(asTrack(video));
			}

			if (options.audio) {
				audio.openDevice(requestedDevice(options.audio) ?? audio.mediaStreamTrack.deviceId);
				tracks.push(asTrack(audio));
			}

			return tracks;
		});

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				LocalMediaService,
				{ provide: LoggerService, useClass: LoggerServiceStub },
				{
					provide: DeviceService,
					useValue: {
						hasVideoDevices,
						hasAudioDevices,
						cameraSelected,
						microphoneSelected: signal<CustomDevice | undefined>(undefined),
						syncDevicesAfterAcquisition
					} as unknown as DeviceService
				},
				{ provide: LivekitSdkService, useValue: livekitSdkService },
				{
					provide: VideoTrackProcessorService,
					useValue: { applyToVideoTrack } as unknown as VideoTrackProcessorService
				},
				{ provide: NotificationService, useValue: notificationService }
			]
		});

		service = TestBed.inject(LocalMediaService);
	});

	describe('the initial state', () => {
		it('starts with both devices wanted', () => {
			expect(service.camera.wanted()).toBeTrue();
			expect(service.microphone.wanted()).toBeTrue();
		});

		it('takes the initial state resolved outside the library', () => {
			service.applyInitialState({ camera: false, microphone: false });

			expect(service.camera.wanted()).toBeFalse();
			expect(service.microphone.wanted()).toBeFalse();
		});

		it('records a toggle made by the participant or a host command', async () => {
			await service.setMicrophoneEnabled(false);
			await service.setCameraEnabled(false);

			expect(service.microphone.wanted()).toBeFalse();
			expect(service.camera.wanted()).toBeFalse();

			await service.setCameraEnabled(true);

			expect(service.camera.wanted()).toBeTrue();
		});

		// The initial state arrives through a reactive input that re-emits on every recomputation, so
		// re-pushing the same value must not clobber a toggle made in the meantime.
		it('does not undo a toggle when the same initial state is pushed again', async () => {
			service.applyInitialState({ camera: true, microphone: true });
			await service.setMicrophoneEnabled(false);

			service.applyInitialState({ camera: true, microphone: true });

			expect(service.microphone.wanted()).toBeFalse();
		});

		it('applies an initial state that actually changed, even after a toggle', async () => {
			service.applyInitialState({ camera: true, microphone: true });
			await service.setCameraEnabled(true);

			service.applyInitialState({ camera: false, microphone: true });

			expect(service.camera.wanted()).toBeFalse();
		});

		it('leaves the other device alone when only one resolved value changed', async () => {
			service.applyInitialState({ camera: true, microphone: true });
			await service.setMicrophoneEnabled(false);

			service.applyInitialState({ camera: false, microphone: true });

			expect(service.camera.wanted()).toBeFalse();
			expect(service.microphone.wanted()).toBeFalse();
		});

		// Across entries the same resolved value is a new request, so the guard must not survive the release.
		it('re-applies the same initial state in a new entry', async () => {
			service.applyInitialState({ camera: true, microphone: true });
			await service.setCameraEnabled(false);

			service.release();
			service.applyInitialState({ camera: true, microphone: true });

			expect(service.camera.wanted()).toBeTrue();
		});

		it('starts a new entry wanting both devices until the initial state lands', async () => {
			await service.setMicrophoneEnabled(false);
			await service.setCameraEnabled(false);

			service.release();

			expect(service.microphone.wanted()).toBeTrue();
			expect(service.camera.wanted()).toBeTrue();
		});
	});

	describe('before any device is opened', () => {
		it('predicts the state from what is wanted, availability included', () => {
			service.applyInitialState({ camera: true, microphone: false });
			hasVideoDevices.set(false);

			expect(service.camera.enabled()).toBeFalse();
			expect(service.microphone.enabled()).toBeFalse();

			hasVideoDevices.set(true);

			expect(service.camera.enabled()).toBeTrue();
		});
	});

	describe('opening the devices', () => {
		it('asks for both devices in a single request, so the browser prompts once', async () => {
			await service.acquire();

			expect(livekitSdkService.createLocalTracks).toHaveBeenCalledTimes(1);
			expect(videoRequest()).toBeTruthy();
			expect(audioRequest()).toBeTruthy();
			expect(service.camera.track()).toBe(asCamera(video));
			expect(service.microphone.track()).toBe(asMicrophone(audio));
		});

		it('opens them with the capture profile', async () => {
			await service.acquire();

			expect(videoRequest().resolution).toEqual(CAMERA_CAPTURE_DEFAULTS.resolution);
			expect(audioRequest().echoCancellation).toBe(MICROPHONE_CAPTURE_DEFAULTS.echoCancellation);
		});

		it('opens the selected devices', async () => {
			cameraSelected.set({ label: 'Webcam', device: 'cam-2' });

			await service.acquire();

			expect(videoRequest().deviceId).toEqual({ exact: 'cam-2' });
		});

		it('asks device by device when the combined request finds one of them busy', async () => {
			video.openDevice = () => {
				throw deviceHeldByAnotherApp();
			};

			await service.acquire();

			expect(livekitSdkService.createLocalTracks).toHaveBeenCalledTimes(3);
			expect(service.camera.track()).toBeUndefined();
			expect(service.microphone.track()).toBe(asMicrophone(audio));
		});

		it('never asks a second time once the permission was denied', async () => {
			livekitSdkService.createLocalTracks.and.rejectWith(permissionDenied());

			await service.acquire();

			expect(livekitSdkService.createLocalTracks).toHaveBeenCalledTimes(1);
			expect(service.camera.enabled()).toBeFalse();
			expect(service.microphone.enabled()).toBeFalse();
		});

		it('leaves a device the participant does not want closed', async () => {
			service.applyInitialState({ camera: false, microphone: true });

			await service.acquire();

			expect(videoRequest()).toBeFalse();
			expect(service.camera.track()).toBeUndefined();
			expect(service.microphone.track()).toBe(asMicrophone(audio));
		});

		it('tells the device catalog what was opened', async () => {
			await service.acquire();

			expect(syncDevicesAfterAcquisition).toHaveBeenCalledOnceWith(
				[Track.Kind.Video, Track.Kind.Audio],
				[asTrack(video), asTrack(audio)]
			);
		});

		it('gives the camera its background processor', async () => {
			await service.acquire();

			expect(applyToVideoTrack).toHaveBeenCalledOnceWith(asTrack(video));
		});

		it('opens the devices once per entry', async () => {
			await service.acquire();
			await service.acquire();

			expect(livekitSdkService.createLocalTracks).toHaveBeenCalledTimes(1);
		});
	});

	describe('reading the devices once opened', () => {
		beforeEach(() => service.acquire());

		it('reports both devices on', () => {
			expect(service.camera.enabled()).toBeTrue();
			expect(service.microphone.enabled()).toBeTrue();
		});

		it('follows a mute made on the track itself, as a mute asked by a moderator is', async () => {
			await video.mute();

			expect(service.camera.enabled()).toBeFalse();
			expect(service.microphone.enabled()).toBeTrue();

			await video.unmute();

			expect(service.camera.enabled()).toBeTrue();
		});

		it('reports a capture that ended as off', () => {
			video.end();

			expect(service.camera.enabled()).toBeFalse();
		});

		it('exposes the capture the microphone monitor clones', () => {
			expect(service.microphone.mediaStreamTrack()).toBe(audio.mediaStreamTrack as unknown as MediaStreamTrack);
		});
	});

	describe('turning a device on and off', () => {
		it('turns the camera off by muting its track', async () => {
			await service.acquire();

			await service.setCameraEnabled(false);

			expect(video.isMuted).toBeTrue();
			expect(service.camera.enabled()).toBeFalse();
			expect(service.camera.wanted()).toBeFalse();
		});

		it('turns a muted camera back on', async () => {
			await service.acquire();
			await service.setCameraEnabled(false);

			await service.setCameraEnabled(true);

			expect(service.camera.enabled()).toBeTrue();
		});

		it('opens a camera that was never opened, on the selected device', async () => {
			service.applyInitialState({ camera: false, microphone: true });
			await service.acquire();
			cameraSelected.set({ label: 'Webcam', device: 'cam-2' });

			await service.setCameraEnabled(true);

			expect(videoRequest(1).deviceId).toEqual({ exact: 'cam-2' });
			expect(livekitSdkService.createLocalTracks.calls.argsFor(1)[0].audio).toBeFalse();
			expect(service.camera.track()).toBe(asCamera(video));
			expect(service.camera.enabled()).toBeTrue();
			expect(applyToVideoTrack).toHaveBeenCalledWith(asTrack(video));
		});

		it('leaves the camera off, and says so, when it cannot be opened', async () => {
			service.applyInitialState({ camera: false, microphone: true });
			await service.acquire();

			video.openDevice = () => {
				throw deviceHeldByAnotherApp();
			};

			await expectAsync(service.setCameraEnabled(true)).toBeRejected();

			expect(service.camera.enabled()).toBeFalse();
			expect(service.camera.wanted()).toBeFalse();
			expect(cameraUnavailableNotice()).toBeTrue();
			expect(syncDevicesAfterAcquisition).toHaveBeenCalledWith([Track.Kind.Video], []);
		});

		it('does not open a camera that is already on', async () => {
			await service.acquire();

			await service.setCameraEnabled(true);

			expect(livekitSdkService.createLocalTracks).toHaveBeenCalledTimes(1);
			expect(video.restartOptions).toEqual([]);
			expect(notificationService.showNotification).not.toHaveBeenCalled();
		});

		it('restarts a camera whose capture ended when asked to turn it on', async () => {
			await service.acquire();
			video.end();

			await service.setCameraEnabled(true);

			expect(video.restartOptions.length).toBe(1);
			expect(service.camera.enabled()).toBeTrue();
		});

		it('turns off a device that has no track without complaint', async () => {
			service.applyInitialState({ camera: false, microphone: true });
			await service.acquire();

			await expectAsync(service.setCameraEnabled(false)).toBeResolved();

			expect(livekitSdkService.createLocalTracks).toHaveBeenCalledTimes(1);
		});
	});

	describe('switching devices', () => {
		beforeEach(() => service.acquire());

		it('restates the capture profile when switching the camera, which replaces the whole constraint set', async () => {
			await service.switchCamera('cam-2');

			expect(video.restartOptions[0]).toEqual({ ...CAMERA_CAPTURE_DEFAULTS, deviceId: { exact: 'cam-2' } });
			expect(video.mediaStreamTrack.deviceId).toBe('cam-2');
		});

		it('restates it when switching the microphone', async () => {
			await service.switchMicrophone('mic-2');

			expect(audio.restartOptions[0]).toEqual({ ...MICROPHONE_CAPTURE_DEFAULTS, deviceId: { exact: 'mic-2' } });
		});

		it('re-reads the capture the mic monitor clones', async () => {
			const before = service.microphone.mediaStreamTrack();

			await service.switchMicrophone('mic-2');

			// The switch swaps the MediaStreamTrack behind the same LocalAudioTrack object, so the
			// monitor would keep analysing a clone of the previous, now stopped, device.
			expect(service.microphone.mediaStreamTrack()).not.toBe(before);
			expect(service.microphone.mediaStreamTrack()).toBe(audio.mediaStreamTrack as unknown as MediaStreamTrack);
		});

		it('keeps a camera that is off closed after switching it', async () => {
			await service.setCameraEnabled(false);

			await service.switchCamera('cam-2');

			// restartTrack reopens the device whatever the mute state, camera light included.
			expect(video.mediaStreamTrack.deviceId).toBe('cam-2');
			expect(video.mediaStreamTrack.readyState).toBe('ended');
			expect(service.camera.enabled()).toBeFalse();
		});

		it('stays on the current camera when the chosen one is held by another application', async () => {
			const failure = deviceHeldByAnotherApp();

			video.openDevice = (deviceId) => {
				if (deviceId === 'cam-2') throw failure;
			};

			await expectAsync(service.switchCamera('cam-2')).toBeRejectedWith(failure);

			// livekit-client stops the current capture before opening the chosen device, so without
			// going back the participant is left with a dead camera behind a control that says on.
			expect(video.mediaStreamTrack.readyState).toBe('live');
			expect(video.mediaStreamTrack.deviceId).toBe('video-1');
			expect(service.camera.enabled()).toBeTrue();
			expect(cameraUnavailableNotice()).toBeTrue();
		});

		it('stays on the current microphone when the chosen one is held by another application', async () => {
			audio.openDevice = (deviceId) => {
				if (deviceId === 'mic-2') throw deviceHeldByAnotherApp();
			};

			await expectAsync(service.switchMicrophone('mic-2')).toBeRejected();

			expect(audio.mediaStreamTrack.readyState).toBe('live');
			expect(service.microphone.mediaStreamTrack()).toBe(audio.mediaStreamTrack as unknown as MediaStreamTrack);
		});

		it('says nothing when the switch works', async () => {
			await service.switchCamera('cam-2');

			expect(notificationService.showNotification).not.toHaveBeenCalled();
		});
	});

	it('leaves a closed device alone when it is switched: it opens on the selected one when turned on', async () => {
		service.applyInitialState({ camera: false, microphone: true });
		await service.acquire();

		await service.switchCamera('cam-2');

		expect(livekitSdkService.createLocalTracks).toHaveBeenCalledTimes(1);
		expect(service.camera.track()).toBeUndefined();
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

			video.openDevice = () => {
				if (Date.now() < cameraFreeAt) throw deviceStillStarting();
			};
		});

		afterEach(() => jasmine.clock().uninstall());

		it('opens the camera once the device is free', async () => {
			await settle(service.acquire());

			expect(service.camera.track()).toBe(asCamera(video));
			expect(service.camera.enabled()).toBeTrue();
		});

		it('keeps the microphone that did open', async () => {
			await settle(service.acquire());

			expect(service.microphone.track()).toBe(asMicrophone(audio));
		});

		it('gives up with the devices it could open when the camera never frees', async () => {
			cameraFreeAt = Infinity;

			await settle(service.acquire());

			expect(service.microphone.enabled()).toBeTrue();
			expect(service.camera.enabled()).toBeFalse();
		});

		it('turns the camera back on once the device is free', async () => {
			cameraFreeAt = 0;
			await service.acquire();
			await service.setCameraEnabled(false);
			cameraFreeAt = Date.now() + RELEASE_MS;

			await settle(service.setCameraEnabled(true));

			expect(service.camera.enabled()).toBeTrue();
			expect(notificationService.showNotification).not.toHaveBeenCalled();
		});

		it('leaves the camera off, and says so, when the device never frees', async () => {
			cameraFreeAt = 0;
			await service.acquire();
			await service.setCameraEnabled(false);
			cameraFreeAt = Infinity;

			await expectAsync(settle(service.setCameraEnabled(true))).toBeRejected();

			expect(service.camera.enabled()).toBeFalse();
			expect(service.camera.wanted()).toBeFalse();
			expect(cameraUnavailableNotice()).toBeTrue();
		});

		it('switches to the chosen camera once the device is free', async () => {
			cameraFreeAt = 0;
			await service.acquire();
			cameraFreeAt = Date.now() + RELEASE_MS;

			await settle(service.switchCamera('cam-2'));

			expect(video.mediaStreamTrack.deviceId).toBe('cam-2');
			expect(video.mediaStreamTrack.readyState).toBe('live');
		});
	});

	describe('once the participant has joined', () => {
		it('publishes the open devices and bumps the participant', async () => {
			await service.acquire();

			await service.publish(asParticipant());

			expect(participant.publishTrack).toHaveBeenCalledWith(asTrack(video));
			expect(participant.publishTrack).toHaveBeenCalledWith(asTrack(audio));
			expect(participant.bump).toHaveBeenCalled();
		});

		it('publishes a device opened after joining', async () => {
			service.applyInitialState({ camera: false, microphone: true });
			await service.acquire();
			await service.publish(asParticipant());
			participant.publishTrack.calls.reset();

			await service.setCameraEnabled(true);

			expect(participant.publishTrack).toHaveBeenCalledOnceWith(asTrack(video));
		});

		it('keeps operating on the very same tracks', async () => {
			await service.acquire();
			await service.publish(asParticipant());

			await service.setCameraEnabled(false);
			await service.switchMicrophone('mic-2');

			expect(video.isMuted).toBeTrue();
			expect(audio.mediaStreamTrack.deviceId).toBe('mic-2');
		});

		it('forgets the participant on release', async () => {
			await service.acquire();
			await service.publish(asParticipant());
			participant.publishTrack.calls.reset();

			service.release();
			await service.acquire();

			expect(participant.publishTrack).not.toHaveBeenCalled();
		});
	});

	describe('one operation at a time', () => {
		let handOver: (tracks: LocalTrack[]) => void = () => {};

		/** Lets the queued operation reach the browser, which then holds the request until {@link handOver}. */
		const browserIsOpeningTheDevices = () => new Promise<void>((resolve) => setTimeout(resolve));

		beforeEach(() => {
			livekitSdkService.createLocalTracks.and.returnValue(new Promise((resolve) => (handOver = resolve)));
		});

		it('applies a toggle issued while the devices are opening to the devices it opened', async () => {
			const acquiring = service.acquire();
			const muting = service.setCameraEnabled(false);

			handOver([asTrack(video), asTrack(audio)]);
			await Promise.all([acquiring, muting]);

			expect(livekitSdkService.createLocalTracks).toHaveBeenCalledTimes(1);
			expect(video.isMuted).toBeTrue();
			expect(service.camera.enabled()).toBeFalse();
		});

		it('closes a device the browser hands over after the release, and opens for the next entry', async () => {
			const acquiring = service.acquire();
			await browserIsOpeningTheDevices();

			service.release();
			handOver([asTrack(video), asTrack(audio)]);
			await acquiring;

			expect(video.stopped).toBeTrue();
			expect(audio.stopped).toBeTrue();
			expect(service.camera.track()).toBeUndefined();

			const next = new FakeLocalTrack(Track.Kind.Video);
			livekitSdkService.createLocalTracks.and.resolveTo([asTrack(next)]);
			await service.acquire();

			expect(service.camera.track()).toBe(asCamera(next));
		});
	});

	describe('releasing', () => {
		it('stops and forgets the tracks', async () => {
			await service.acquire();

			service.release();

			expect(video.stopped).toBeTrue();
			expect(audio.stopped).toBeTrue();
			expect(service.camera.track()).toBeUndefined();
			expect(service.microphone.mediaStreamTrack()).toBeUndefined();
		});

		it('opens the devices again in the next entry', async () => {
			await service.acquire();
			service.release();
			video = new FakeLocalTrack(Track.Kind.Video);
			audio = new FakeLocalTrack(Track.Kind.Audio);

			await service.acquire();

			expect(livekitSdkService.createLocalTracks).toHaveBeenCalledTimes(2);
			expect(service.camera.enabled()).toBeTrue();
		});
	});
});
