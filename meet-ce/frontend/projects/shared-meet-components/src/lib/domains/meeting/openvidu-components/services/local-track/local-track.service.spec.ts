import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LoggerService } from '../../../../../shared/services/logger.service';
import { DeviceService } from '../device/device.service';
import { LocalTrack, Track } from '../livekit';
import { LivekitSdkService } from '../livekit/livekit-sdk.service';
import { MeetingLiveKitService } from '../meeting-livekit/meeting-livekit.service';
import { MediaStorageService } from '../storage/storage.service';
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
	readonly mediaStreamTrack: { id: string; enabled: boolean };

	constructor(readonly kind: Track.Kind) {
		this.mediaStreamTrack = { id: `mst-${kind}`, enabled: true };
	}

	async mute(): Promise<void> {
		this.isMuted = true;
	}

	async unmute(): Promise<void> {
		this.isMuted = false;
	}

	stop(): void {}

	detach(): void {}
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
	let storageService: { isCameraEnabled: jasmine.Spy; isMicrophoneEnabled: jasmine.Spy };
	let livekitSdkService: jasmine.SpyObj<LivekitSdkService>;

	const asTrack = (track: FakeLocalTrack) => track as unknown as LocalTrack;

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
		storageService = {
			isCameraEnabled: jasmine.createSpy('isCameraEnabled').and.returnValue(true),
			isMicrophoneEnabled: jasmine.createSpy('isMicrophoneEnabled').and.returnValue(true)
		};
		livekitSdkService = jasmine.createSpyObj<LivekitSdkService>('LivekitSdkService', ['createLocalTracks']);
		livekitSdkService.createLocalTracks.and.resolveTo([]);

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				LocalTrackService,
				{ provide: LoggerService, useClass: LoggerServiceStub },
				{ provide: DeviceService, useValue: deviceService as unknown as DeviceService },
				{ provide: MediaStorageService, useValue: storageService as unknown as MediaStorageService },
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

	// Enabling a device that was never opened — joined with initial-video-enabled="false", or the
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

		it('leaves the fresh track muted while the preference still says off', async () => {
			// Why the media-control facade records the preference BEFORE asking for the change:
			// createLocalTracks mutes what it opens when the preference is off.
			storageService.isCameraEnabled.and.returnValue(false);
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
});
