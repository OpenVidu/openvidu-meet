import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LoggerService } from '../../../../../shared/services/logger.service';
import { DeviceService } from '../device/device.service';
import { CAMERA_CAPTURE_DEFAULTS, MICROPHONE_CAPTURE_DEFAULTS } from '../../models/media-capture.model';
import type { AudioCaptureOptions, CreateLocalTracksOptions, VideoCaptureOptions } from '../livekit';
import { LocalTrack, LocalVideoTrack, Track } from '../livekit';
import { LivekitSdkService } from '../livekit/livekit-sdk.service';
import { MeetingLiveKitService } from '../meeting-livekit/meeting-livekit.service';
import { LocalMediaIntentService } from '../local-media-intent/local-media-intent.service';
import { VideoTrackProcessorService } from '../track-processor/video-track-processor.service';
import { LocalTrackService } from './local-track.service';

class LoggerServiceStub {
	get() {
		return { d: () => {}, v: () => {}, w: () => {}, e: () => {} };
	}
}

/**
 * Stand-in for a LiveKit local track. `mute()`/`unmute()` flip `isMuted` on this object **in place**,
 * exactly like the real ones — which is why the service has to re-emit its track array for the
 * enabled computeds to notice.
 */
class FakeLocalTrack {
	isMuted = false;
	mediaStreamTrack: FakeMediaStreamTrack;
	/** Constraints each restartTrack() was asked for, so a device switch can be inspected. */
	readonly restartOptions: Array<VideoCaptureOptions | AudioCaptureOptions | undefined> = [];
	/** Stands for the browser opening the device: throws like `getUserMedia` for a device it cannot open. */
	openDevice: (deviceId: string) => void = () => {};

	constructor(
		readonly kind: Track.Kind,
		deviceId = `${kind}-1`
	) {
		this.mediaStreamTrack = new FakeMediaStreamTrack(deviceId);
	}

	async mute(): Promise<void> {
		this.isMuted = true;
	}

	/** Re-acquires the device first, exactly like the real camera track, so it can fail and stay muted. */
	async unmute(): Promise<void> {
		this.openDevice(this.mediaStreamTrack.deviceId);
		this.isMuted = false;
	}

	/**
	 * Swaps the capture track in place, exactly like the real one: the object identity survives, and
	 * the current capture is stopped before the new device is opened, so a device that cannot be
	 * opened leaves the track with a dead capture.
	 */
	async restartTrack(options?: VideoCaptureOptions | AudioCaptureOptions): Promise<void> {
		this.restartOptions.push(options);
		this.mediaStreamTrack.stop();
		const deviceId = requestedDevice(options) ?? this.mediaStreamTrack.deviceId;
		this.openDevice(deviceId);
		this.mediaStreamTrack = new FakeMediaStreamTrack(deviceId);
	}

	stop(): void {}

	detach(): void {}
}

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

const requestedDevice = (options?: VideoCaptureOptions | AudioCaptureOptions): string | undefined => {
	const constraint = options?.deviceId as { exact?: string; ideal?: string } | undefined;
	return constraint?.exact ?? constraint?.ideal;
};

const deviceStillStarting = () => Object.assign(new Error('Timeout starting video source'), { name: 'AbortError' });
const deviceHeldByAnotherApp = () =>
	Object.assign(new Error('Could not start video source'), { name: 'NotReadableError' });

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

describe('LocalTrackService', () => {
	let service: LocalTrackService;
	let audio: FakeLocalTrack;
	let video: FakeLocalTrack;
	let deviceService: {
		hasVideoDevices: jasmine.Spy;
		hasAudioDevices: jasmine.Spy;
		cameraSelected: jasmine.Spy;
		microphoneSelected: jasmine.Spy;
		syncDevicesAfterAcquisition: jasmine.Spy;
	};
	let mediaIntent: { cameraEnabled: jasmine.Spy; microphoneEnabled: jasmine.Spy };
	let livekitSdkService: jasmine.SpyObj<LivekitSdkService>;
	let applyToVideoTrack: jasmine.Spy;

	const asTrack = (track: FakeLocalTrack) => track as unknown as LocalTrack;
	const asMediaStreamTrack = (track: FakeMediaStreamTrack) => track as unknown as MediaStreamTrack;

	beforeEach(() => {
		audio = new FakeLocalTrack(Track.Kind.Audio);
		video = new FakeLocalTrack(Track.Kind.Video);
		deviceService = {
			hasVideoDevices: jasmine.createSpy('hasVideoDevices').and.returnValue(true),
			hasAudioDevices: jasmine.createSpy('hasAudioDevices').and.returnValue(true),
			cameraSelected: jasmine.createSpy('cameraSelected').and.returnValue(undefined),
			microphoneSelected: jasmine.createSpy('microphoneSelected').and.returnValue(undefined),
			syncDevicesAfterAcquisition: jasmine.createSpy('syncDevicesAfterAcquisition').and.resolveTo(undefined)
		};
		mediaIntent = {
			cameraEnabled: jasmine.createSpy('cameraEnabled').and.returnValue(true),
			microphoneEnabled: jasmine.createSpy('microphoneEnabled').and.returnValue(true)
		};
		livekitSdkService = jasmine.createSpyObj<LivekitSdkService>('LivekitSdkService', ['createLocalTracks']);
		livekitSdkService.createLocalTracks.and.resolveTo([]);
		applyToVideoTrack = jasmine.createSpy('applyToVideoTrack').and.resolveTo();

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				LocalTrackService,
				{ provide: LoggerService, useClass: LoggerServiceStub },
				{ provide: DeviceService, useValue: deviceService as unknown as DeviceService },
				{ provide: LocalMediaIntentService, useValue: mediaIntent as unknown as LocalMediaIntentService },
				{ provide: LivekitSdkService, useValue: livekitSdkService },
				{
					provide: VideoTrackProcessorService,
					useValue: {
						isBackgroundProcessorSupported: () => false,
						applyToVideoTrack
					} as unknown as VideoTrackProcessorService
				},
				{ provide: MeetingLiveKitService, useValue: {} as unknown as MeetingLiveKitService }
			]
		});

		service = TestBed.inject(LocalTrackService);
	});

	describe('with no prejoin tracks', () => {
		it('falls back to what the participant asked for, availability included', () => {
			expect(service.microphoneEnabled()).toBeTrue();
			expect(service.cameraEnabled()).toBeTrue();

			mediaIntent.microphoneEnabled.and.returnValue(false);
			service.setLocalTracks([]);

			expect(service.microphoneEnabled()).toBeFalse();
		});
	});

	describe('with prejoin tracks', () => {
		beforeEach(() => service.setLocalTracks([asTrack(audio), asTrack(video)]));

		it('reports both devices on', () => {
			expect(service.microphoneEnabled()).toBeTrue();
			expect(service.cameraEnabled()).toBeTrue();
		});

		it('reports a mute even though the track object is mutated in place', async () => {
			// Regression guard: mute() flips isMuted on the same object, and the track signals compare
			// by MediaStreamTrack id, so without the array re-emit this stayed stuck at true — which is
			// how a host mediaToggleAudio() could mute the device with the prejoin UI none the wiser.
			await service.setAudioTrackEnabled(false);

			expect(service.microphoneEnabled()).toBeFalse();
			expect(service.cameraEnabled()).toBeTrue();
		});

		it('reports an unmute as well', async () => {
			await service.setAudioTrackEnabled(false);
			await service.setAudioTrackEnabled(true);

			expect(service.microphoneEnabled()).toBeTrue();
		});

		it('reports the camera separately from the microphone', async () => {
			await service.setVideoTrackEnabled(false);

			expect(service.cameraEnabled()).toBeFalse();
			expect(service.microphoneEnabled()).toBeTrue();
		});

		it('reports a missing kind as off instead of falling back to the preference', () => {
			// A device that could not be opened leaves the other track behind: "no track" is off, and
			// the stored preference must not override that.
			service.setLocalTracks([asTrack(audio)]);

			expect(service.cameraEnabled()).toBeFalse();
			expect(service.microphoneEnabled()).toBeTrue();
		});

		it('reports off once the underlying MediaStreamTrack is disabled', () => {
			audio.mediaStreamTrack.enabled = false;
			service.setLocalTracks([asTrack(audio), asTrack(video)]);

			expect(service.microphoneEnabled()).toBeFalse();
		});

		it('falls back to the preference again after the tracks are released', () => {
			mediaIntent.microphoneEnabled.and.returnValue(false);

			service.removeLocalTracks();

			expect(service.microphoneEnabled()).toBeFalse();
		});
	});

	// Enabling a device that was never opened — joined with initial-video-active="false", or the
	// stored preference was off, so createLocalTracks() skipped it. This used to live behind a UI
	// click in the prejoin component, so an embedded host's mediaToggleVideo(true) did nothing at all.
	describe('enabling a device that was never opened', () => {
		beforeEach(() => {
			// Arrived with the camera preference off: only the microphone track exists.
			service.setLocalTracks([asTrack(audio)]);
			expect(service.cameraEnabled()).toBeFalse();
		});

		it('opens the camera and reports it on', async () => {
			livekitSdkService.createLocalTracks.and.resolveTo([asTrack(video)]);

			await service.setVideoTrackEnabled(true);

			expect(livekitSdkService.createLocalTracks).toHaveBeenCalled();
			expect(service.cameraEnabled()).toBeTrue();
			expect(service.microphoneEnabled()).toBeTrue();
		});

		it('leaves the fresh track muted while the intent still says off', async () => {
			// Why the media-control facade records the intent BEFORE asking for the change:
			// createLocalTracks mutes what it opens when the intent is off.
			mediaIntent.cameraEnabled.and.returnValue(false);
			livekitSdkService.createLocalTracks.and.resolveTo([asTrack(video)]);

			await service.setVideoTrackEnabled(true);

			expect(service.cameraEnabled()).toBeFalse();
		});

		it('stays off when the device cannot be opened', async () => {
			livekitSdkService.createLocalTracks.and.rejectWith(new Error('NotReadableError'));

			await service.setVideoTrackEnabled(true);

			expect(service.cameraEnabled()).toBeFalse();
		});

		it('opens the microphone too', async () => {
			service.setLocalTracks([asTrack(video)]);
			livekitSdkService.createLocalTracks.and.resolveTo([asTrack(audio)]);

			await service.setAudioTrackEnabled(true);

			expect(service.microphoneEnabled()).toBeTrue();
		});
	});

	describe('opening the camera and the microphone together', () => {
		const failWith = (name: string) => Object.assign(new Error(name), { name });

		it('asks for both devices in a single request, so the browser prompts once', async () => {
			livekitSdkService.createLocalTracks.and.resolveTo([asTrack(video), asTrack(audio)]);

			await service.createLocalTracks();

			expect(livekitSdkService.createLocalTracks).toHaveBeenCalledTimes(1);

			const options = livekitSdkService.createLocalTracks.calls.mostRecent().args[0];
			expect(options.video).toBeTruthy();
			expect(options.audio).toBeTruthy();
		});

		it('asks device by device when the combined request finds one of them busy', async () => {
			livekitSdkService.createLocalTracks.and.callFake(async (options) => {
				if (options.audio && options.video) {
					throw failWith('NotReadableError');
				}

				return options.audio ? [asTrack(audio)] : [];
			});

			const tracks = await service.createLocalTracks();

			expect(livekitSdkService.createLocalTracks).toHaveBeenCalledTimes(3);
			expect(tracks).toEqual([asTrack(audio)]);
		});

		it('never asks a second time once the permission was denied', async () => {
			livekitSdkService.createLocalTracks.and.rejectWith(failWith('NotAllowedError'));

			const tracks = await service.createLocalTracks();

			expect(livekitSdkService.createLocalTracks).toHaveBeenCalledTimes(1);
			expect(tracks).toEqual([]);
		});
	});
	// Rescued from main's LocalMediaService suite: the capture profile, the device switch and the
	// state a failed acquisition must report.
	describe('the shared capture profile', () => {
		const lastRequest = (): CreateLocalTracksOptions =>
			livekitSdkService.createLocalTracks.calls.mostRecent().args[0];

		it('opens both devices with it', async () => {
			await service.createLocalTracks();

			const video = lastRequest().video as VideoCaptureOptions;
			const audio = lastRequest().audio as AudioCaptureOptions;

			// Without it each path captures whatever the browser defaults to, so the published
			// resolution would depend on how the device happened to be opened.
			expect(video.resolution).toEqual(CAMERA_CAPTURE_DEFAULTS.resolution);
			expect(audio.echoCancellation).toBe(MICROPHONE_CAPTURE_DEFAULTS.echoCancellation);
			expect(audio.autoGainControl).toBe(MICROPHONE_CAPTURE_DEFAULTS.autoGainControl);
		});

		it('restates it when switching the camera, which replaces the whole constraint set', async () => {
			service.setLocalTracks([asTrack(video)]);

			await service.switchCamera('cam-2');

			const options = video.restartOptions[0] as VideoCaptureOptions;
			expect(options.deviceId).toEqual({ exact: 'cam-2' });
			expect(options.resolution).toEqual(CAMERA_CAPTURE_DEFAULTS.resolution);
		});

		it('restates it when switching the microphone', async () => {
			service.setLocalTracks([asTrack(audio)]);

			await service.switchMicrophone('mic-2');

			const options = audio.restartOptions[0] as AudioCaptureOptions;
			expect(options.deviceId).toEqual({ exact: 'mic-2' });
			expect(options.echoCancellation).toBe(MICROPHONE_CAPTURE_DEFAULTS.echoCancellation);
			expect(options.autoGainControl).toBe(MICROPHONE_CAPTURE_DEFAULTS.autoGainControl);
		});
	});

	describe('switching devices', () => {
		it('re-reads the capture track the mic monitor clones', async () => {
			service.setLocalTracks([asTrack(audio)]);
			const before = service.microphoneMediaStreamTrack();

			await service.switchMicrophone('mic-2');

			// The switch swaps the MediaStreamTrack behind the same LocalAudioTrack object, so a signal
			// of tracks cannot see it: the monitor would keep analysing a clone of the previous — now
			// stopped — device and the mic warnings would go quiet for good.
			expect(service.microphoneMediaStreamTrack()).not.toBe(before);
			expect(service.microphoneMediaStreamTrack()).toBe(asMediaStreamTrack(audio.mediaStreamTrack));
		});

		it('leaves the camera device closed when switching while it is off', async () => {
			mediaIntent.cameraEnabled.and.returnValue(false);
			video.isMuted = true;
			service.setLocalTracks([asTrack(video)]);

			await service.switchCamera('cam-2');

			// restartTrack re-acquired the device; mute() returns early on an already-muted track, so
			// without an explicit stop the camera stays open, light on, behind a UI that says off.
			expect(video.mediaStreamTrack.readyState).toBe('ended');
			expect(service.cameraEnabled()).toBeFalse();
		});

		it('leaves the microphone capture closed when switching while it is off', async () => {
			mediaIntent.microphoneEnabled.and.returnValue(false);
			audio.isMuted = true;
			service.setLocalTracks([asTrack(audio)]);

			await service.switchMicrophone('mic-2');

			expect(audio.mediaStreamTrack.readyState).toBe('ended');
			expect(service.microphoneEnabled()).toBeFalse();
		});

		it('opens the requested camera when no camera track exists yet, with the background processor', async () => {
			const fresh = new FakeLocalTrack(Track.Kind.Video);
			livekitSdkService.createLocalTracks.and.resolveTo([asTrack(fresh)]);
			service.setLocalTracks([asTrack(audio)]);

			await service.switchCamera('cam-2');

			const request = livekitSdkService.createLocalTracks.calls.mostRecent().args[0];
			expect((request.video as VideoCaptureOptions).deviceId).toEqual({ exact: 'cam-2' });
			expect(request.audio).toBeFalse();
			expect(applyToVideoTrack).toHaveBeenCalledWith(asTrack(fresh));
			expect(service.cameraTrack()).toBe(asTrack(fresh) as LocalVideoTrack);
		});

		it('stays on the current camera when the chosen one is held by another application', async () => {
			const failure = deviceHeldByAnotherApp();

			video.openDevice = (deviceId) => {
				if (deviceId === 'cam-2') throw failure;
			};

			service.setLocalTracks([asTrack(video)]);

			await expectAsync(service.switchCamera('cam-2')).toBeRejectedWith(failure);

			// livekit-client stops the current capture before opening the chosen device, so without
			// going back the participant is left with a dead camera behind a control that says on.
			expect(video.mediaStreamTrack.readyState).toBe('live');
			expect(video.mediaStreamTrack.deviceId).toBe('video-1');
			expect(service.cameraEnabled()).toBeTrue();
		});

		it('stays on the current microphone when the chosen one is held by another application', async () => {
			audio.openDevice = (deviceId) => {
				if (deviceId === 'mic-2') throw deviceHeldByAnotherApp();
			};

			service.setLocalTracks([asTrack(audio)]);

			await expectAsync(service.switchMicrophone('mic-2')).toBeRejected();

			expect(audio.mediaStreamTrack.readyState).toBe('live');
			expect(service.microphoneMediaStreamTrack()).toBe(asMediaStreamTrack(audio.mediaStreamTrack));
		});

		it('opens the requested microphone when no microphone track exists yet', async () => {
			const fresh = new FakeLocalTrack(Track.Kind.Audio);
			livekitSdkService.createLocalTracks.and.resolveTo([asTrack(fresh)]);
			service.setLocalTracks([]);

			await service.switchMicrophone('mic-2');

			const request = livekitSdkService.createLocalTracks.calls.mostRecent().args[0];
			expect((request.audio as AudioCaptureOptions).deviceId).toEqual({ exact: 'mic-2' });
			expect((request.audio as AudioCaptureOptions).echoCancellation).toBe(
				MICROPHONE_CAPTURE_DEFAULTS.echoCancellation
			);
			expect(request.video).toBeFalse();
			expect(service.microphoneMediaStreamTrack()).toBe(asMediaStreamTrack(fresh.mediaStreamTrack));
		});
	});

	describe('when no device could be opened at all', () => {
		it('does not report a device as on just because the intent says so', async () => {
			livekitSdkService.createLocalTracks.and.resolveTo([]);

			service.setLocalTracks(await service.createLocalTracks());

			// The devices are present and the intent says on, but neither capture started: reporting
			// them enabled shows a preview that is on and displays nothing.
			expect(service.cameraEnabled()).toBeFalse();
			expect(service.microphoneEnabled()).toBeFalse();
		});
	});
	// Windows + Chrome reject a camera request with AbortError ("Timeout starting video source")
	// while the OS is still releasing the device from its previous consumer; the very same request
	// succeeds a few hundred milliseconds later. Reported upstream as OpenVidu/openvidu#855.
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

			livekitSdkService.createLocalTracks.and.callFake(async (options) => {
				const tracks: LocalTrack[] = [];

				if (options.video) {
					video.openDevice('video-1');
					tracks.push(asTrack(video));
				}

				if (options.audio) tracks.push(asTrack(audio));

				return tracks;
			});
		});

		afterEach(() => jasmine.clock().uninstall());

		it('opens the camera once the device is free', async () => {
			const tracks = await settle(service.createLocalTracks());

			expect(tracks).toContain(asTrack(video));
		});

		it('keeps the microphone that did open', async () => {
			const tracks = await settle(service.createLocalTracks());

			expect(tracks).toContain(asTrack(audio));
		});

		it('gives up with the devices it could open when the camera never frees', async () => {
			cameraFreeAt = Infinity;

			service.setLocalTracks(await settle(service.createLocalTracks()));

			expect(service.microphoneEnabled()).toBeTrue();
			expect(service.cameraEnabled()).toBeFalse();
		});

		// Turning the camera off stops the capture to switch the camera light off, so turning it back
		// on reopens the device just released: the same race, on the most repeated action of a call.
		it('turns the camera back on once the device is free', async () => {
			video.isMuted = true;
			service.setLocalTracks([asTrack(video)]);

			await settle(service.setVideoTrackEnabled(true));

			expect(service.cameraEnabled()).toBeTrue();
		});

		it('leaves the camera off, and says so, when the device never frees', async () => {
			cameraFreeAt = Infinity;
			video.isMuted = true;
			service.setLocalTracks([asTrack(video)]);

			await expectAsync(settle(service.setVideoTrackEnabled(true))).toBeRejected();

			expect(service.cameraEnabled()).toBeFalse();
		});

		it('switches to the chosen camera once the device is free', async () => {
			service.setLocalTracks([asTrack(video)]);

			await settle(service.switchCamera('cam-2'));

			expect(video.mediaStreamTrack.deviceId).toBe('cam-2');
			expect(video.mediaStreamTrack.readyState).toBe('live');
		});
	});
});
