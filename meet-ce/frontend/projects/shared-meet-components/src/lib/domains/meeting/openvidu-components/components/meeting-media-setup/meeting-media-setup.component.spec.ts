import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LoggerService } from '../../../../../shared/services/logger.service';
import { NotificationService } from '../../../../../shared/services/notification.service';
import { CdkOverlayService } from '../../services/cdk-overlay/cdk-overlay.service';
import { MeetingUiConfigService } from '../../services/config/meeting-ui-config.service';
import { DeviceService } from '../../services/device/device.service';
import { LocalAudioTrack, LocalTrack, LocalVideoTrack, Track } from '../../services/livekit';
import { LivekitSdkService } from '../../services/livekit/livekit-sdk.service';
import { LocalMediaService } from '../../services/local-media/local-media.service';
import { VideoTrackProcessorService } from '../../services/track-processor/video-track-processor.service';
import { MeetingTranslateService } from '../../services/translate/meeting-translate.service';
import { ViewportService } from '../../services/viewport/viewport.service';
import { VirtualBackgroundService } from '../../services/virtual-background/virtual-background.service';
import { MeetingMediaSetupComponent } from './meeting-media-setup.component';

class LoggerServiceStub {
	get() {
		return { d: () => {}, v: () => {}, w: () => {}, e: () => {} };
	}
}

class FakeLocalTrack {
	isMuted = false;
	readonly mediaStreamTrack = { enabled: true, readyState: 'live', stop: () => {} };

	constructor(readonly kind: Track.Kind) {}

	on(): this {
		return this;
	}

	off(): this {
		return this;
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

/**
 * Runs the device initialization to completion under the mocked clock, releasing whatever timer it
 * waits on. An acquisition that backs off before trying the device again would otherwise never be
 * let through.
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

/**
 * What the prejoin does with a camera that fails to open. The media layer is the real one, because
 * what is under test is precisely how far an acquisition failure travels: the screen only reacts to
 * what LocalMediaService hands back.
 */
describe('MeetingMediaSetupComponent', () => {
	let component: MeetingMediaSetupComponent;
	let localMedia: LocalMediaService;
	let livekitSdkService: jasmine.SpyObj<LivekitSdkService>;
	let audio: FakeLocalTrack;
	let video: FakeLocalTrack;
	/** The camera stays busy until the clock reaches this, like a device the OS has not released. */
	let cameraFreeAt: number;

	const asTrack = (track: FakeLocalTrack) => track as unknown as LocalTrack;
	const asCamera = (track: FakeLocalTrack) => track as unknown as LocalVideoTrack;
	const asMicrophone = (track: FakeLocalTrack) => track as unknown as LocalAudioTrack;

	beforeEach(() => {
		audio = new FakeLocalTrack(Track.Kind.Audio);
		video = new FakeLocalTrack(Track.Kind.Video);

		livekitSdkService = jasmine.createSpyObj<LivekitSdkService>('LivekitSdkService', ['createLocalTracks']);
		livekitSdkService.createLocalTracks.and.callFake(async (options) => {
			const tracks: LocalTrack[] = [];

			if (options.video) {
				if (Date.now() < cameraFreeAt) {
					throw Object.assign(new Error('Timeout starting video source'), { name: 'AbortError' });
				}

				tracks.push(asTrack(video));
			}

			if (options.audio) tracks.push(asTrack(audio));

			return tracks;
		});

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				LocalMediaService,
				{ provide: LoggerService, useClass: LoggerServiceStub },
				{ provide: LivekitSdkService, useValue: livekitSdkService },
				{
					provide: DeviceService,
					useValue: {
						hasVideoDevices: signal(true),
						hasAudioDevices: signal(true),
						cameraSelected: signal(undefined),
						microphoneSelected: signal(undefined),
						syncDevicesAfterAcquisition: () => Promise.resolve()
					} as unknown as DeviceService
				},
				{
					provide: VideoTrackProcessorService,
					useValue: {
						isBackgroundProcessorSupported: signal(false),
						applyToVideoTrack: () => Promise.resolve()
					} as unknown as VideoTrackProcessorService
				},
				{
					provide: NotificationService,
					useValue: { showNotification: () => 0 } as unknown as NotificationService
				},
				{
					provide: MeetingUiConfigService,
					useValue: {
						showCameraControlsSignal: signal(true),
						showMicrophoneControlsSignal: signal(true),
						backgroundEffectsButtonSignal: signal(false),
						displayLogoSignal: signal(false),
						participantNameSignal: signal('')
					} as unknown as MeetingUiConfigService
				},
				{ provide: CdkOverlayService, useValue: { setSelector: () => {} } as unknown as CdkOverlayService },
				{
					provide: VirtualBackgroundService,
					useValue: {
						applyBackgroundFromStorage: () => Promise.resolve()
					} as unknown as VirtualBackgroundService
				},
				{
					provide: MeetingTranslateService,
					useValue: { translate: (key: string) => key } as unknown as MeetingTranslateService
				},
				{ provide: ViewportService, useValue: { isMobile: () => false } as unknown as ViewportService }
			]
		});

		// The prejoin markup is not what is under test, and rendering it would pull in the device
		// selectors, the background panel and a video element bound to a real MediaStreamTrack.
		TestBed.overrideComponent(MeetingMediaSetupComponent, { set: { template: '', imports: [], styles: [] } });

		component = TestBed.createComponent(MeetingMediaSetupComponent).componentInstance;
		localMedia = TestBed.inject(LocalMediaService);

		jasmine.clock().install();
		jasmine.clock().mockDate(new Date(0));
		cameraFreeAt = Infinity;
	});

	afterEach(() => jasmine.clock().uninstall());

	it('opens both devices when they are free', async () => {
		cameraFreeAt = 0;

		await settle(component.ngOnInit());

		expect(localMedia.camera.track()).toBe(asCamera(video));
		expect(localMedia.microphone.track()).toBe(asMicrophone(audio));
		expect(component.errorMessage()).toBeUndefined();
	});

	it('tells the participant when the camera could not be opened', async () => {
		await settle(component.ngOnInit());

		expect(component.errorMessage()).toBe('ERRORS.CAMERA_UNAVAILABLE');
	});

	it('stays usable with the microphone that did open', async () => {
		await settle(component.ngOnInit());

		expect(component.isLoading()).toBeFalse();
		expect(localMedia.camera.track()).toBeUndefined();
		expect(localMedia.microphone.track()).toBe(asMicrophone(audio));
	});

	it('shows the devices the owner opened, not a copy of them', async () => {
		cameraFreeAt = 0;

		await settle(component.ngOnInit());

		expect(component.videoTrack()).toBe(asCamera(video));
		expect(component.isVideoEnabled()).toBeTrue();
	});
});
