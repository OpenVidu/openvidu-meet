import { effect, provideZonelessChangeDetection, Signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LoggerService } from '../../../../../shared/services/logger.service';
import { CustomDevice } from '../../models/device.model';
import { CAMERA_CAPTURE_DEFAULTS, MICROPHONE_CAPTURE_DEFAULTS } from '../../models/media-capture.model';
import { ParticipantModel } from '../../models/participant.model';
import { MeetingUiConfigService } from '../config/meeting-ui-config.service';
import { DeviceService } from '../device/device.service';
import { StreamLayoutStateService } from '../layout/stream-layout-state.service';
import type { AudioCaptureOptions, CreateLocalTracksOptions, LocalTrack, VideoCaptureOptions } from '../livekit';
import { Track } from '../livekit';
import { LivekitSdkService } from '../livekit/livekit-sdk.service';
import { MeetingLiveKitService } from '../meeting-livekit/meeting-livekit.service';
import { ParticipantService } from '../participant/participant.service';
import { MediaStorageService } from '../storage/storage.service';
import { VideoTrackProcessorService } from '../track-processor/video-track-processor.service';
import { LocalMediaService } from './local-media.service';

/**
 * Every real device acquisition (one getUserMedia) is appended here, whether it comes from a track
 * creation or from a `restartTrack()` re-acquisition. Tests assert on it because "how many times
 * did we open the camera" is the property users notice: a camera light blinking, a Bluetooth
 * headset re-negotiating, an extra permission prompt.
 */
let acquisitions: Array<'audio' | 'video'>;
let mediaStreamTrackCounter: number;

class FakeMediaStreamTrack {
	readyState: 'live' | 'ended' = 'live';
	enabled = true;

	constructor(
		readonly id: string,
		readonly kind: 'audio' | 'video'
	) {}

	stop(): void {
		this.readyState = 'ended';
	}
}

const acquireMediaStreamTrack = (kind: 'audio' | 'video'): FakeMediaStreamTrack => {
	acquisitions.push(kind);
	mediaStreamTrackCounter++;

	return new FakeMediaStreamTrack(`mst-${kind}-${mediaStreamTrackCounter}`, kind);
};

/**
 * LocalTrack double mirroring the livekit-client semantics this service depends on:
 *
 * - `mute()`/`unmute()` return early when the track is already in that state.
 * - muting a camera stops the underlying MediaStreamTrack (that is what turns the camera light
 *   off); a microphone only flips `enabled` (the app publishes with `stopMicTrackOnMute: false`).
 * - `unmute()` on a camera re-acquires the device, and `restartTrack()` swaps the MediaStreamTrack
 *   in place, leaving `enabled` in sync with the mute state.
 */
class FakeLocalTrack {
	isMuted = false;
	mediaStreamTrack: FakeMediaStreamTrack;
	stopped = false;
	detached = false;
	readonly restartOptions: Array<VideoCaptureOptions | AudioCaptureOptions | undefined> = [];

	constructor(readonly kind: Track.Kind) {
		this.mediaStreamTrack = acquireMediaStreamTrack(this.isVideo ? 'video' : 'audio');
	}

	private get isVideo(): boolean {
		return this.kind === Track.Kind.Video;
	}

	async mute(): Promise<this> {
		if (this.isMuted) return this;

		if (this.isVideo) this.mediaStreamTrack.stop();

		this.isMuted = true;
		this.mediaStreamTrack.enabled = false;

		return this;
	}

	async unmute(): Promise<this> {
		if (!this.isMuted) return this;

		if (this.isVideo) await this.restartTrack();

		this.isMuted = false;
		this.mediaStreamTrack.enabled = true;

		return this;
	}

	async restartTrack(options?: VideoCaptureOptions | AudioCaptureOptions): Promise<this> {
		this.restartOptions.push(options);
		this.mediaStreamTrack.stop();
		this.mediaStreamTrack = acquireMediaStreamTrack(this.isVideo ? 'video' : 'audio');
		this.mediaStreamTrack.enabled = !this.isMuted;

		return this;
	}

	stop(): void {
		this.stopped = true;
		this.mediaStreamTrack.stop();
	}

	detach(): void {
		this.detached = true;
	}
}

const asLocalTrack = (track: FakeLocalTrack): LocalTrack => track as unknown as LocalTrack;

class FakeLivekitSdkService {
	readonly calls: CreateLocalTracksOptions[] = [];
	readonly created: FakeLocalTrack[] = [];
	audioFailure: Error | undefined;
	videoFailure: Error | undefined;

	async createLocalTracks(options: CreateLocalTracksOptions): Promise<LocalTrack[]> {
		this.calls.push(options);
		const tracks: LocalTrack[] = [];

		if (options.video) {
			if (this.videoFailure) throw this.videoFailure;

			tracks.push(asLocalTrack(this.track(Track.Kind.Video)));
		}

		if (options.audio) {
			if (this.audioFailure) throw this.audioFailure;

			tracks.push(asLocalTrack(this.track(Track.Kind.Audio)));
		}

		return tracks;
	}

	/** The last track of the given kind this fake handed out, or undefined. */
	lastTrack(kind: Track.Kind): FakeLocalTrack | undefined {
		return this.created.filter((track) => track.kind === kind).at(-1);
	}

	private track(kind: Track.Kind): FakeLocalTrack {
		const track = new FakeLocalTrack(kind);
		this.created.push(track);

		return track;
	}

	/** Options of the single call that requested the given kind. Fails the test when ambiguous. */
	callFor(kind: 'audio' | 'video'): CreateLocalTracksOptions {
		const matches = this.calls.filter((call) => !!call[kind]);

		expect(matches.length).toBe(1);

		return matches[0];
	}
}

class FakeStorageService {
	cameraEnabled = true;
	microphoneEnabled = true;
	videoDevice: CustomDevice | null = null;
	audioDevice: CustomDevice | null = null;

	isCameraEnabled(): boolean {
		return this.cameraEnabled;
	}

	setCameraEnabled(enabled: boolean): void {
		this.cameraEnabled = enabled;
	}

	isMicrophoneEnabled(): boolean {
		return this.microphoneEnabled;
	}

	setMicrophoneEnabled(enabled: boolean): void {
		this.microphoneEnabled = enabled;
	}

	getVideoDevice(): CustomDevice | null {
		return this.videoDevice;
	}

	getAudioDevice(): CustomDevice | null {
		return this.audioDevice;
	}
}

class FakeDeviceService {
	cameras: CustomDevice[] = [];
	microphones: CustomDevice[] = [];
	selectedCamera: CustomDevice | undefined;
	selectedMicrophone: CustomDevice | undefined;
	readonly syncedTracks: LocalTrack[][] = [];

	hasVideoDevices = (): boolean => this.cameras.length > 0;
	hasAudioDevices = (): boolean => this.microphones.length > 0;
	cameraSelected = (): CustomDevice | undefined => this.selectedCamera;
	microphoneSelected = (): CustomDevice | undefined => this.selectedMicrophone;

	async syncDevicesAfterTrackCreation(tracks: LocalTrack[]): Promise<void> {
		this.syncedTracks.push(tracks);
	}
}

/** ParticipantModel double: only the media surface LocalMediaService drives. */
class FakeParticipant {
	isCameraEnabled = false;
	isMicrophoneEnabled = false;
	isScreenShareEnabled = false;
	bumps = 0;
	setCameraCalls: Array<{ enabled: boolean; options?: VideoCaptureOptions }> = [];
	setMicrophoneCalls: Array<{ enabled: boolean; options?: AudioCaptureOptions }> = [];
	switchCameraCalls: string[] = [];
	switchMicrophoneCalls: string[] = [];
	cameraTrack: FakeLocalTrack | undefined;
	microphoneTrack: FakeLocalTrack | undefined;
	setCameraRejection: Error | undefined;

	async setCameraEnabled(enabled: boolean, options?: VideoCaptureOptions): Promise<void> {
		if (this.setCameraRejection) throw this.setCameraRejection;

		this.setCameraCalls.push({ enabled, options });
		this.isCameraEnabled = enabled;
	}

	async setMicrophoneEnabled(enabled: boolean, options?: AudioCaptureOptions): Promise<void> {
		this.setMicrophoneCalls.push({ enabled, options });
		this.isMicrophoneEnabled = enabled;
	}

	async switchCamera(deviceId: string): Promise<void> {
		this.switchCameraCalls.push(deviceId);
	}

	async switchMicrophone(deviceId: string): Promise<void> {
		this.switchMicrophoneCalls.push(deviceId);
	}

	getCameraTrack(): LocalTrack | undefined {
		return this.cameraTrack ? asLocalTrack(this.cameraTrack) : undefined;
	}

	getMicrophoneTrack(): LocalTrack | undefined {
		return this.microphoneTrack ? asLocalTrack(this.microphoneTrack) : undefined;
	}

	bump(): void {
		this.bumps++;
	}
}

const device = (id: string, label = id): CustomDevice => ({ label, device: id }) as CustomDevice;

describe('LocalMediaService', () => {
	let service: LocalMediaService;
	let sdk: FakeLivekitSdkService;
	let storage: FakeStorageService;
	let devices: FakeDeviceService;
	let participant: FakeParticipant;
	let connected: boolean;
	let localParticipant: FakeParticipant | undefined;
	let uiConfig: { videoEnabled: boolean; audioEnabled: boolean };
	let processorSpy: jasmine.Spy;
	let layoutService: jasmine.SpyObj<StreamLayoutStateService>;

	/** Counts how often a track signal notifies its consumers (this is what drives MicActivityService). */
	const countNotifications = (track: Signal<unknown>): { count: number } => {
		const counter = { count: 0 };

		TestBed.runInInjectionContext(() => {
			effect(() => {
				track();
				counter.count++;
			});
		});
		TestBed.tick();

		return counter;
	};

	beforeEach(() => {
		acquisitions = [];
		mediaStreamTrackCounter = 0;
		connected = false;
		localParticipant = undefined;
		participant = new FakeParticipant();
		sdk = new FakeLivekitSdkService();
		storage = new FakeStorageService();
		devices = new FakeDeviceService();
		uiConfig = { videoEnabled: true, audioEnabled: true };
		processorSpy = jasmine.createSpy('applyToVideoTrack').and.resolveTo(undefined);
		layoutService = jasmine.createSpyObj<StreamLayoutStateService>('StreamLayoutStateService', [
			'unpinAllStreams',
			'toggleStreamPinned',
			'recordScreenSharePublication',
			'clearScreenSharePublication',
			'setLastScreenPinned'
		]);

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				{ provide: LivekitSdkService, useValue: sdk as unknown as LivekitSdkService },
				{ provide: MediaStorageService, useValue: storage as unknown as MediaStorageService },
				{ provide: DeviceService, useValue: devices as unknown as DeviceService },
				{ provide: VideoTrackProcessorService, useValue: { applyToVideoTrack: processorSpy } },
				{ provide: MeetingLiveKitService, useValue: { isConnected: () => connected } },
				{
					provide: ParticipantService,
					useValue: {
						localParticipant: () => localParticipant as unknown as ParticipantModel | undefined
					}
				},
				{
					provide: MeetingUiConfigService,
					useValue: {
						isVideoEnabled: () => uiConfig.videoEnabled,
						isAudioEnabled: () => uiConfig.audioEnabled
					}
				},
				{ provide: StreamLayoutStateService, useValue: layoutService },
				{ provide: LoggerService, useValue: { get: () => ({ d: () => {}, w: () => {}, e: () => {} }) } }
			]
		});

		service = TestBed.inject(LocalMediaService);
	});

	/** Puts the service in the connected-meeting phase with a published participant. */
	const joinMeeting = (): void => {
		connected = true;
		localParticipant = participant;
	};

	const prejoinCamera = () => service.cameraTrack() as unknown as FakeLocalTrack | undefined;
	/** The microphone is observed through its capture track, the signal the app actually exposes. */
	const microphoneCapture = () => service.microphoneMediaStreamTrack() as unknown as FakeMediaStreamTrack | undefined;
	const createdMicrophone = () => sdk.lastTrack(Track.Kind.Audio);

	describe('prejoin start', () => {
		beforeEach(() => {
			devices.cameras = [device('cam-1'), device('cam-2')];
			devices.microphones = [device('mic-1')];
			devices.selectedCamera = device('cam-2');
			devices.selectedMicrophone = device('mic-1');
		});

		it('opens the stored camera and microphone exactly once each', async () => {
			await service.initPrejoinMedia();

			expect(acquisitions.sort()).toEqual(['audio', 'video']);
			expect(prejoinCamera()?.isMuted).toBe(false);
			expect(microphoneCapture()?.enabled).toBe(true);
			expect(service.isMyCameraEnabled()).toBe(true);
			expect(service.isMyMicrophoneEnabled()).toBe(true);
		});

		it('requests each kind separately, never as a combined audio+video permission probe', async () => {
			await service.initPrejoinMedia();

			expect(sdk.calls.length).toBe(2);
			expect(sdk.calls.filter((call) => !!call.audio && !!call.video)).toEqual([]);
		});

		it('applies the shared capture profile to both kinds', async () => {
			await service.initPrejoinMedia();

			const video = sdk.callFor('video').video as VideoCaptureOptions;
			const audio = sdk.callFor('audio').audio as AudioCaptureOptions;

			expect(video.resolution).toEqual(CAMERA_CAPTURE_DEFAULTS.resolution);
			expect(audio.echoCancellation).toBe(MICROPHONE_CAPTURE_DEFAULTS.echoCancellation);
			expect(audio.noiseSuppression).toBe(MICROPHONE_CAPTURE_DEFAULTS.noiseSuppression);
			expect(audio.autoGainControl).toBe(MICROPHONE_CAPTURE_DEFAULTS.autoGainControl);
		});

		it('opens the selected devices, not the browser defaults', async () => {
			await service.initPrejoinMedia();

			expect((sdk.callFor('video').video as VideoCaptureOptions).deviceId).toEqual({ exact: 'cam-2' });
			expect((sdk.callFor('audio').audio as AudioCaptureOptions).deviceId).toEqual({ exact: 'mic-1' });
		});

		it('attaches the background processor to the camera track and syncs the device list afterwards', async () => {
			await service.initPrejoinMedia();

			expect(processorSpy).toHaveBeenCalledTimes(1);
			expect(devices.syncedTracks.length).toBe(1);
			expect(devices.syncedTracks[0].length).toBe(2);
		});
	});

	describe('granting permission on first visit', () => {
		it('requests the default devices so the creation itself obtains permission', async () => {
			// First visit: nothing enumerated yet, because labels (and therefore the device list)
			// only exist once permission has been granted by this very call.
			await service.initPrejoinMedia();

			expect(acquisitions.sort()).toEqual(['audio', 'video']);
			expect((sdk.callFor('video').video as VideoCaptureOptions).deviceId).toBeUndefined();
			expect(devices.syncedTracks.length).toBe(1);
		});
	});

	describe('no devices available', () => {
		it('reports both kinds as disabled when neither device could be opened', async () => {
			sdk.videoFailure = new DOMException('Requested device not found', 'NotFoundError');
			sdk.audioFailure = new DOMException('Requested device not found', 'NotFoundError');

			await service.initPrejoinMedia();

			expect(prejoinCamera()).toBeUndefined();
			expect(microphoneCapture()).toBeUndefined();
			expect(service.isMyCameraEnabled()).toBe(false);
			expect(service.isMyMicrophoneEnabled()).toBe(false);
		});

		it('never publishes tracks on join when no device could be opened', async () => {
			sdk.videoFailure = new DOMException('Permission denied', 'NotAllowedError');
			sdk.audioFailure = new DOMException('Permission denied', 'NotAllowedError');

			await service.initPrejoinMedia();

			expect(await service.acquireJoinTracks()).toEqual([]);
		});
	});

	describe('initial media state', () => {
		it('honours an explicit "off" from the embedding app and persists it', () => {
			expect(service.applyInitialCameraPreference(false)).toBe(false);
			expect(storage.isCameraEnabled()).toBe(false);
			expect(service.applyInitialMicrophonePreference(false)).toBe(false);
			expect(storage.isMicrophoneEnabled()).toBe(false);
		});

		it('never re-enables a device the participant had turned off', () => {
			storage.cameraEnabled = false;
			storage.microphoneEnabled = false;

			expect(service.applyInitialCameraPreference(true)).toBe(false);
			expect(service.applyInitialMicrophonePreference(true)).toBe(false);
		});

		it('keeps a stored "on" preference when the embedding app asks for on', () => {
			expect(service.applyInitialCameraPreference(true)).toBe(true);
			expect(service.applyInitialMicrophonePreference(true)).toBe(true);
		});

		it('opens no camera at all when the initial state is off', async () => {
			storage.cameraEnabled = false;
			devices.microphones = [device('mic-1')];

			await service.initPrejoinMedia();

			expect(acquisitions).toEqual(['audio']);
			expect(prejoinCamera()).toBeUndefined();
			expect(service.isMyCameraEnabled()).toBe(false);
			expect(service.isMyMicrophoneEnabled()).toBe(true);
		});

		it('reports the camera as off while the embedding app disables video, even with a live track', async () => {
			await service.initPrejoinMedia();
			uiConfig.videoEnabled = false;

			expect(prejoinCamera()?.isMuted).toBe(false);
			expect(service.isMyCameraEnabled()).toBe(false);
		});
	});

	describe('busy devices', () => {
		it('still opens the microphone when the camera is held by another application', async () => {
			sdk.videoFailure = new DOMException('Could not start video source', 'NotReadableError');

			await service.initPrejoinMedia();

			expect(prejoinCamera()).toBeUndefined();
			expect(microphoneCapture()).toBeDefined();
			expect(service.isMyCameraEnabled()).toBe(false);
			expect(service.isMyMicrophoneEnabled()).toBe(true);
		});

		it('still opens the camera when the microphone is busy', async () => {
			sdk.audioFailure = new DOMException('Could not start audio source', 'NotReadableError');

			await service.initPrejoinMedia();

			expect(microphoneCapture()).toBeUndefined();
			expect(prejoinCamera()).toBeDefined();
			expect(service.isMyMicrophoneEnabled()).toBe(false);
			expect(service.isMyCameraEnabled()).toBe(true);
		});

		it('does not claim the camera is on when it could not be opened at all', async () => {
			// The device is present and the preference says "on", but the capture failed: the prejoin
			// must not show an enabled camera it has no track for.
			devices.cameras = [device('cam-1')];
			devices.microphones = [device('mic-1')];
			sdk.videoFailure = new DOMException('Could not start video source', 'NotReadableError');
			sdk.audioFailure = new DOMException('Could not start audio source', 'NotReadableError');

			await service.initPrejoinMedia();

			expect(service.isMyCameraEnabled()).toBe(false);
			expect(service.isMyMicrophoneEnabled()).toBe(false);
		});
	});

	describe('mute and unmute in the prejoin', () => {
		beforeEach(async () => {
			devices.cameras = [device('cam-1')];
			devices.microphones = [device('mic-1')];
			devices.selectedCamera = device('cam-1');
			devices.selectedMicrophone = device('mic-1');
			await service.initPrejoinMedia();
			acquisitions = [];
		});

		it('closes the camera device when disabled and persists the preference', async () => {
			const track = prejoinCamera()!;

			await service.setCameraEnabled(false);

			expect(track.isMuted).toBe(true);
			expect(track.mediaStreamTrack.readyState).toBe('ended');
			expect(storage.isCameraEnabled()).toBe(false);
			expect(service.isMyCameraEnabled()).toBe(false);
		});

		it('keeps the microphone device open when muted, so speaking-while-muted can be detected', async () => {
			const capture = microphoneCapture()!;

			await service.setMicrophoneEnabled(false);

			expect(createdMicrophone()?.isMuted).toBe(true);
			expect(capture.readyState).toBe('live');
			expect(capture.enabled).toBe(false);
			expect(microphoneCapture()).toBe(capture);
			expect(storage.isMicrophoneEnabled()).toBe(false);
		});

		it('re-acquires the camera on unmute and reports it enabled again', async () => {
			await service.setCameraEnabled(false);
			acquisitions = [];

			await service.setCameraEnabled(true);

			expect(acquisitions).toEqual(['video']);
			expect(prejoinCamera()?.isMuted).toBe(false);
			expect(prejoinCamera()?.mediaStreamTrack.readyState).toBe('live');
			expect(storage.isCameraEnabled()).toBe(true);
			expect(service.isMyCameraEnabled()).toBe(true);
		});

		it('unmutes the microphone without re-acquiring the device', async () => {
			await service.setMicrophoneEnabled(false);
			acquisitions = [];

			await service.setMicrophoneEnabled(true);

			expect(acquisitions).toEqual([]);
			expect(microphoneCapture()?.enabled).toBe(true);
			expect(service.isMyMicrophoneEnabled()).toBe(true);
		});
	});

	describe('enabling a device that was never opened', () => {
		beforeEach(() => {
			devices.cameras = [device('cam-1')];
			devices.microphones = [device('mic-1')];
			devices.selectedCamera = device('cam-1');
			devices.selectedMicrophone = device('mic-1');
			storage.cameraEnabled = false;
			storage.microphoneEnabled = false;
		});

		it('opens the camera with a single getUserMedia', async () => {
			await service.initPrejoinMedia();
			acquisitions = [];

			await service.setCameraEnabled(true);

			// Creating the track muted and unmuting it afterwards would re-acquire the device: two
			// getUserMedia calls and a visible camera-light blink for one user action.
			expect(acquisitions).toEqual(['video']);
			expect(prejoinCamera()?.isMuted).toBe(false);
			expect(prejoinCamera()?.mediaStreamTrack.enabled).toBe(true);
			expect(service.isMyCameraEnabled()).toBe(true);
		});

		it('opens the microphone with a single getUserMedia', async () => {
			await service.initPrejoinMedia();
			acquisitions = [];

			await service.setMicrophoneEnabled(true);

			expect(acquisitions).toEqual(['audio']);
			expect(createdMicrophone()?.isMuted).toBe(false);
			expect(microphoneCapture()?.enabled).toBe(true);
			expect(service.isMyMicrophoneEnabled()).toBe(true);
		});

		it('publishes the newly opened camera when the participant joins', async () => {
			await service.initPrejoinMedia();
			await service.setCameraEnabled(true);
			acquisitions = [];

			const joinTracks = await service.acquireJoinTracks();

			expect(joinTracks.length).toBe(1);
			expect(joinTracks[0].kind).toBe(Track.Kind.Video);
			expect(acquisitions).toEqual([]);
		});

		it('opens nothing when disabling a device that was never opened', async () => {
			await service.initPrejoinMedia();
			acquisitions = [];

			await service.setCameraEnabled(false);
			await service.setMicrophoneEnabled(false);

			expect(acquisitions).toEqual([]);
			expect(prejoinCamera()).toBeUndefined();
			expect(microphoneCapture()).toBeUndefined();
		});
	});

	describe('device switch in the prejoin', () => {
		beforeEach(async () => {
			devices.cameras = [device('cam-1'), device('cam-2')];
			devices.microphones = [device('mic-1'), device('mic-2')];
			devices.selectedCamera = device('cam-1');
			devices.selectedMicrophone = device('mic-1');
			await service.initPrejoinMedia();
			acquisitions = [];
		});

		it('restarts the existing camera track on the new device, restating the capture profile', async () => {
			const track = prejoinCamera()!;

			await service.switchCamera('cam-2');

			expect(track.restartOptions.length).toBe(1);
			const options = track.restartOptions[0] as VideoCaptureOptions;
			expect(options.deviceId).toEqual({ exact: 'cam-2' });
			expect(options.resolution).toEqual(CAMERA_CAPTURE_DEFAULTS.resolution);
		});

		it('restarts the existing microphone track on the new device, restating the capture profile', async () => {
			const track = createdMicrophone()!;

			await service.switchMicrophone('mic-2');

			expect(track.restartOptions.length).toBe(1);
			const options = track.restartOptions[0] as AudioCaptureOptions;
			expect(options.deviceId).toEqual({ exact: 'mic-2' });
			expect(options.echoCancellation).toBe(MICROPHONE_CAPTURE_DEFAULTS.echoCancellation);
			expect(options.autoGainControl).toBe(MICROPHONE_CAPTURE_DEFAULTS.autoGainControl);
		});

		it('notifies the capture consumers after a microphone switch, so the mic monitor re-clones', async () => {
			// restartTrack swaps the MediaStreamTrack behind the same LocalAudioTrack object, so a
			// signal of tracks holds an unchanged value: the monitor would keep analysing a clone of
			// the previous — now stopped — device and the mic warnings would go quiet for good.
			const notifications = countNotifications(service.microphoneMediaStreamTrack);
			const before = notifications.count;
			const previousCapture = microphoneCapture();

			await service.switchMicrophone('mic-2');
			TestBed.tick();

			expect(notifications.count).toBe(before + 1);
			expect(microphoneCapture()).not.toBe(previousCapture);
		});

		it('swaps the camera capture in place, keeping the track the video element is attached to', async () => {
			const track = prejoinCamera()!;
			const previousCapture = track.mediaStreamTrack;

			await service.switchCamera('cam-2');

			expect(prejoinCamera()).toBe(track);
			expect(track.mediaStreamTrack).not.toBe(previousCapture);
			expect(track.mediaStreamTrack.readyState).toBe('live');
		});

		it('leaves the camera device closed when switching while the camera is off', async () => {
			await service.setCameraEnabled(false);
			const track = prejoinCamera()!;

			await service.switchCamera('cam-2');

			// The switch re-acquires the device to apply the new constraints; it must not leave the
			// camera open (and its light on) while the UI shows the camera as off.
			expect(track.isMuted).toBe(true);
			expect(track.mediaStreamTrack.readyState).toBe('ended');
			expect(service.isMyCameraEnabled()).toBe(false);
		});

		it('opens the requested microphone when no microphone track exists yet', async () => {
			storage.microphoneEnabled = false;
			service.discardPrejoinMedia();
			await service.initPrejoinMedia();
			acquisitions = [];

			await service.switchMicrophone('mic-2');

			expect(acquisitions).toEqual(['audio']);
			expect((sdk.calls[sdk.calls.length - 1].audio as AudioCaptureOptions).deviceId).toEqual({
				exact: 'mic-2'
			});
			expect(microphoneCapture()).toBeDefined();
			// The preference still says "off", so the freshly opened microphone must arrive muted.
			expect(createdMicrophone()?.isMuted).toBe(true);
		});

		it('opens the requested camera when no camera track exists yet', async () => {
			storage.cameraEnabled = false;
			service.discardPrejoinMedia();
			await service.initPrejoinMedia();
			acquisitions = [];
			processorSpy.calls.reset();

			await service.switchCamera('cam-2');

			expect(acquisitions).toEqual(['video']);
			expect((sdk.calls[sdk.calls.length - 1].video as VideoCaptureOptions).deviceId).toEqual({
				exact: 'cam-2'
			});
			expect(processorSpy).toHaveBeenCalledTimes(1);
			expect(prejoinCamera()?.isMuted).toBe(true);
		});
	});

	describe('in the meeting', () => {
		beforeEach(() => {
			joinMeeting();
		});

		it('toggles the camera on the published participant, with the stored device and capture profile', async () => {
			storage.videoDevice = device('cam-2');

			await service.setCameraEnabled(true);

			expect(participant.setCameraCalls.length).toBe(1);
			expect(participant.setCameraCalls[0].enabled).toBe(true);
			expect(participant.setCameraCalls[0].options?.deviceId).toBe('cam-2');
			expect(participant.setCameraCalls[0].options?.resolution).toEqual(CAMERA_CAPTURE_DEFAULTS.resolution);
			expect(participant.bumps).toBe(1);
			expect(acquisitions).toEqual([]);
			expect(storage.isCameraEnabled()).toBe(true);
		});

		it('toggles the microphone on the published participant, with the stored device and capture profile', async () => {
			storage.audioDevice = device('mic-2');

			await service.setMicrophoneEnabled(false);

			expect(participant.setMicrophoneCalls.length).toBe(1);
			expect(participant.setMicrophoneCalls[0].options?.deviceId).toBe('mic-2');
			expect(participant.setMicrophoneCalls[0].options?.voiceIsolation).toBe(
				MICROPHONE_CAPTURE_DEFAULTS.voiceIsolation
			);
			expect(participant.bumps).toBe(1);
			expect(storage.isMicrophoneEnabled()).toBe(false);
		});

		it('reads the enabled state from the participant, not from the stored preference', () => {
			participant.isCameraEnabled = true;
			participant.isMicrophoneEnabled = false;
			storage.cameraEnabled = false;
			storage.microphoneEnabled = true;

			expect(service.isMyCameraEnabled()).toBe(true);
			expect(service.isMyMicrophoneEnabled()).toBe(false);
		});

		it('does not persist the preference when the participant call fails', async () => {
			participant.setCameraRejection = new Error('device error');

			await expectAsync(service.setCameraEnabled(false)).toBeRejected();

			expect(storage.isCameraEnabled()).toBe(true);
		});

		it('switches devices through the participant and bumps its revision', async () => {
			await service.switchCamera('cam-2');
			await service.switchMicrophone('mic-2');

			expect(participant.switchCameraCalls).toEqual(['cam-2']);
			expect(participant.switchMicrophoneCalls).toEqual(['mic-2']);
			expect(participant.bumps).toBe(2);
			expect(acquisitions).toEqual([]);
		});

		it('follows the participant tracks instead of the prejoin ones', () => {
			const cameraTrack = new FakeLocalTrack(Track.Kind.Video);
			const microphoneTrack = new FakeLocalTrack(Track.Kind.Audio);
			participant.cameraTrack = cameraTrack;
			participant.microphoneTrack = microphoneTrack;

			expect(prejoinCamera()).toBe(cameraTrack);
			expect(microphoneCapture()).toBe(microphoneTrack.mediaStreamTrack);
		});
	});

	describe('while the connection is being resumed', () => {
		beforeEach(async () => {
			devices.cameras = [device('cam-1')];
			devices.microphones = [device('mic-1')];
			await service.initPrejoinMedia();
			service.releaseJoinTracks();
			// A signal-resume leaves the participant published while the room reports "not connected".
			localParticipant = participant;
			connected = false;
			acquisitions = [];
		});

		it('never opens a second camera behind the published participant', async () => {
			await service.setCameraEnabled(true);

			expect(acquisitions).toEqual([]);
			expect(prejoinCamera()).toBeUndefined();
		});

		it('never opens a second microphone behind the published participant', async () => {
			await service.setMicrophoneEnabled(true);

			expect(acquisitions).toEqual([]);
			expect(microphoneCapture()).toBeUndefined();
		});
	});

	describe('join lifecycle', () => {
		it('publishes the prejoin tracks without re-acquiring the devices', async () => {
			await service.initPrejoinMedia();
			const camera = prejoinCamera();
			acquisitions = [];

			const joinTracks = await service.acquireJoinTracks();

			expect(acquisitions).toEqual([]);
			expect(joinTracks.length).toBe(2);
			expect(joinTracks).toContain(asLocalTrack(camera!));
		});

		it('opens the stored devices once when no prejoin ran', async () => {
			const joinTracks = await service.acquireJoinTracks();

			expect(acquisitions.sort()).toEqual(['audio', 'video']);
			expect(joinTracks.length).toBe(2);
			expect(devices.syncedTracks.length).toBe(1);
		});

		it('opens nothing when the embedding app disabled both kinds and no prejoin ran', async () => {
			uiConfig.videoEnabled = false;
			uiConfig.audioEnabled = false;

			expect(await service.acquireJoinTracks()).toEqual([]);
			expect(acquisitions).toEqual([]);
		});

		it('never opens the devices twice when the join is retried', async () => {
			await service.acquireJoinTracks();
			acquisitions = [];

			await service.acquireJoinTracks();

			expect(acquisitions).toEqual([]);
		});

		it('releases the published tracks without stopping them', async () => {
			await service.initPrejoinMedia();
			const camera = prejoinCamera()!;
			const microphone = createdMicrophone()!;

			service.releaseJoinTracks();

			expect(camera.stopped).toBe(false);
			expect(microphone.stopped).toBe(false);
			expect(prejoinCamera()).toBeUndefined();
			expect(microphoneCapture()).toBeUndefined();
		});

		it('stops and detaches the tracks when the prejoin is abandoned', async () => {
			await service.initPrejoinMedia();
			const camera = prejoinCamera()!;
			const microphone = createdMicrophone()!;

			service.discardPrejoinMedia();

			expect(camera.stopped).toBe(true);
			expect(camera.detached).toBe(true);
			expect(microphone.stopped).toBe(true);
			expect(microphone.detached).toBe(true);
			expect(prejoinCamera()).toBeUndefined();
			expect(microphoneCapture()).toBeUndefined();
		});

		it('reopens the devices for a new prejoin after the previous one was abandoned', async () => {
			await service.initPrejoinMedia();
			service.discardPrejoinMedia();
			acquisitions = [];

			await service.initPrejoinMedia();

			expect(acquisitions.sort()).toEqual(['audio', 'video']);
			expect(prejoinCamera()).toBeDefined();
		});

		it('detaches the mic monitor when the prejoin is abandoned', async () => {
			await service.initPrejoinMedia();
			const notifications = countNotifications(service.microphoneMediaStreamTrack);
			const before = notifications.count;

			service.discardPrejoinMedia();
			TestBed.tick();

			expect(notifications.count).toBe(before + 1);
			expect(microphoneCapture()).toBeUndefined();
		});
	});

	describe('screen share', () => {
		beforeEach(() => {
			joinMeeting();
		});

		it('pins the shared screen and records the publication', async () => {
			const screenTrack = { trackSid: 'TR_screen', addListener: () => {} };
			(participant as unknown as { setScreenShareEnabled: unknown }).setScreenShareEnabled = async () =>
				screenTrack;

			await service.setScreenShareEnabled(true);

			expect(layoutService.unpinAllStreams).toHaveBeenCalled();
			expect(layoutService.toggleStreamPinned).toHaveBeenCalledWith('TR_screen');
			expect(layoutService.recordScreenSharePublication).toHaveBeenCalled();
			expect(participant.bumps).toBe(1);
		});

		it('re-pins the last screen when the local share stops', async () => {
			const screenTrack = { trackSid: 'TR_screen', addListener: () => {} };
			(participant as unknown as { setScreenShareEnabled: unknown }).setScreenShareEnabled = async () =>
				screenTrack;

			await service.setScreenShareEnabled(false);

			expect(layoutService.clearScreenSharePublication).toHaveBeenCalledWith('TR_screen');
			expect(layoutService.setLastScreenPinned).toHaveBeenCalled();
		});
	});
});
