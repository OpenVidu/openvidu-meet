import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LoggerService } from '../../../../../shared/services/logger.service';
import { DeviceService } from '../device/device.service';
import { CAMERA_CAPTURE_DEFAULTS, MICROPHONE_CAPTURE_DEFAULTS } from '../../models/media-capture.model';
import type { AudioCaptureOptions, CreateLocalTracksOptions, VideoCaptureOptions } from '../livekit';
import { LocalTrack, Track } from '../livekit';
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
	private restarts = 0;

	constructor(readonly kind: Track.Kind) {
		this.mediaStreamTrack = new FakeMediaStreamTrack(`mst-${kind}`);
	}

	async mute(): Promise<void> {
		this.isMuted = true;
	}

	async unmute(): Promise<void> {
		this.isMuted = false;
	}

	/** Swaps the capture track in place, exactly like the real one — the object identity survives. */
	async restartTrack(options?: VideoCaptureOptions | AudioCaptureOptions): Promise<void> {
		this.restartOptions.push(options);
		this.mediaStreamTrack.stop();
		this.restarts++;
		this.mediaStreamTrack = new FakeMediaStreamTrack(`mst-${this.kind}-restart-${this.restarts}`);
	}

	stop(): void {}

	detach(): void {}
}

class FakeMediaStreamTrack {
	enabled = true;
	readyState: 'live' | 'ended' = 'live';

	constructor(readonly id: string) {}

	stop(): void {
		this.readyState = 'ended';
	}
}

describe('LocalTrackService', () => {
	let service: LocalTrackService;
	let audio: FakeLocalTrack;
	let video: FakeLocalTrack;
	let deviceService: {
		isCameraEnabled: jasmine.Spy;
		isMicrophoneEnabled: jasmine.Spy;
		hasVideoDevices: jasmine.Spy;
		hasAudioDevices: jasmine.Spy;
		hasVideoPermission: jasmine.Spy;
		hasAudioPermission: jasmine.Spy;
		cameraSelected: jasmine.Spy;
		microphoneSelected: jasmine.Spy;
	};
	let mediaIntent: { cameraEnabled: jasmine.Spy; microphoneEnabled: jasmine.Spy };
	let livekitSdkService: jasmine.SpyObj<LivekitSdkService>;

	const asTrack = (track: FakeLocalTrack) => track as unknown as LocalTrack;
	const asMediaStreamTrack = (track: FakeMediaStreamTrack) => track as unknown as MediaStreamTrack;

	beforeEach(() => {
		audio = new FakeLocalTrack(Track.Kind.Audio);
		video = new FakeLocalTrack(Track.Kind.Video);
		deviceService = {
			isCameraEnabled: jasmine.createSpy('isCameraEnabled').and.returnValue(true),
			isMicrophoneEnabled: jasmine.createSpy('isMicrophoneEnabled').and.returnValue(true),
			hasVideoDevices: jasmine.createSpy('hasVideoDevices').and.returnValue(true),
			hasAudioDevices: jasmine.createSpy('hasAudioDevices').and.returnValue(true),
			hasVideoPermission: jasmine.createSpy('hasVideoPermission').and.returnValue(true),
			hasAudioPermission: jasmine.createSpy('hasAudioPermission').and.returnValue(true),
			cameraSelected: jasmine.createSpy('cameraSelected').and.returnValue(undefined),
			microphoneSelected: jasmine.createSpy('microphoneSelected').and.returnValue(undefined)
		};
		mediaIntent = {
			cameraEnabled: jasmine.createSpy('cameraEnabled').and.returnValue(true),
			microphoneEnabled: jasmine.createSpy('microphoneEnabled').and.returnValue(true)
		};
		livekitSdkService = jasmine.createSpyObj<LivekitSdkService>('LivekitSdkService', ['createLocalTracks']);
		livekitSdkService.createLocalTracks.and.resolveTo([]);

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
						applyToVideoTrack: () => Promise.resolve()
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

			deviceService.isMicrophoneEnabled.and.returnValue(false);
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
			deviceService.isMicrophoneEnabled.and.returnValue(false);

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
			deviceService.isCameraEnabled.and.returnValue(false);
			video.isMuted = true;
			service.setLocalTracks([asTrack(video)]);

			await service.switchCamera('cam-2');

			// restartTrack re-acquired the device; mute() returns early on an already-muted track, so
			// without an explicit stop the camera stays open — light on — behind a UI that says off.
			expect(video.mediaStreamTrack.readyState).toBe('ended');
			expect(service.cameraEnabled()).toBeFalse();
		});

		it('opens the requested microphone when no microphone track exists yet', async () => {
			const fresh = new FakeLocalTrack(Track.Kind.Audio);
			livekitSdkService.createLocalTracks.and.resolveTo([asTrack(fresh)]);
			service.setLocalTracks([]);

			await service.switchMicrophone('mic-2');

			// The request has to be shaped as CreateLocalTracksOptions: passing the bare capture
			// options meant livekit saw neither audio nor video and getUserMedia threw every time.
			const request = livekitSdkService.createLocalTracks.calls.mostRecent().args[0];
			expect((request.audio as AudioCaptureOptions).deviceId).toEqual({ exact: 'mic-2' });
			expect(request.video).toBeUndefined();
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
});
