import { computed, inject, Service, Signal, signal } from '@angular/core';
import { CAMERA_CAPTURE_DEFAULTS, MICROPHONE_CAPTURE_DEFAULTS } from '../../models/media-capture.model';
import { DeviceService } from '../device/device.service';
import {
	AudioCaptureOptions,
	CreateLocalTracksOptions,
	LocalAudioTrack,
	LocalTrack,
	LocalVideoTrack,
	MediaDeviceFailure,
	Track,
	VideoCaptureOptions
} from '../livekit';
import { LivekitSdkService } from '../livekit/livekit-sdk.service';
import { LocalMediaIntentService } from '../local-media-intent/local-media-intent.service';
import { VideoTrackProcessorService } from '../track-processor/video-track-processor.service';
import { LoggerService } from '../../../../../shared/services/logger.service';
import type { ILogger } from '../../../../../shared/models/logger.model';

/**
 * Owns the local participant's media capture: creating/switching camera & microphone tracks
 * (prejoin and in-call) and their enabled state. The room connection itself lives separately
 * in MeetingLiveKitService.
 */
@Service()
export class LocalTrackService {
	private readonly deviceService = inject(DeviceService);
	private readonly mediaIntent = inject(LocalMediaIntentService);
	private readonly livekitSdkService = inject(LivekitSdkService);
	private readonly videoTrackProcessorService = inject(VideoTrackProcessorService);

	/*
	 * Tracks used in the prejoin component. They are created when the room is not yet created.
	 *
	 * Reactive source of truth for the prejoin phase: mutating it re-drives the
	 * microphone/camera computeds below, which feed LocalMediaStateService and, through it,
	 * MicActivityService. Always mutate via setLocalTracks/removeLocalTracks/clearLocalTracksReference
	 * or update() — never push into the array in place, or the signal would not notify.
	 */
	private readonly _localTracks = signal<LocalTrack[]>([]);

	/**
	 * Whether an acquisition has already run. Before it does, the enabled state can only be predicted
	 * from the intent; afterwards the tracks are the truth, so a device that could not be opened
	 * (busy, unplugged, permission revoked) is not reported as enabled.
	 */
	private tracksAcquired = false;

	/** Whether the prejoin (media-setup) screen is mounted with its devices ready. */
	private readonly _prejoinActive = signal(false);
	readonly prejoinActive = this._prejoinActive.asReadonly();

	/**
	 * Current prejoin camera track, or undefined. A device switch swaps the MediaStreamTrack *inside*
	 * this object (`restartTrack`), so its value is unchanged by a switch: livekit-client re-attaches
	 * the new MediaStreamTrack to the already-attached video elements, and consumers that must follow
	 * the real capture read {@link microphoneMediaStreamTrack} instead.
	 * @internal
	 */
	readonly cameraTrack: Signal<LocalVideoTrack | undefined> = computed(
		() => this._localTracks().find((t) => t.kind === Track.Kind.Video) as LocalVideoTrack | undefined
	);

	/**
	 * The MediaStreamTrack the prejoin microphone is capturing, or undefined. Consumers that own
	 * something derived from the raw capture — MicActivityService clones it — must depend on this and
	 * not on a signal of track objects: a device switch swaps the MediaStreamTrack inside the same
	 * LocalAudioTrack object, so a signal of tracks holds the same value before and after the switch
	 * and cannot notify, while the raw capture track is a new object per acquisition and does.
	 * @internal
	 */
	readonly microphoneMediaStreamTrack: Signal<MediaStreamTrack | undefined> = computed(
		() =>
			(this._localTracks().find((t) => t.kind === Track.Kind.Audio) as LocalAudioTrack | undefined)
				?.mediaStreamTrack
	);

	/**
	 * Whether the prejoin microphone is on. Derived from the track's `isMuted`/`enabled`, which
	 * `mute()`/`unmute()` flip in place, so every mutation of the enabled state has to emit a new
	 * array reference — see {@link setAudioTrackEnabled}.
	 * @internal
	 */
	readonly microphoneEnabled: Signal<boolean> = computed(() => this.isTrackEnabled(Track.Kind.Audio));

	/**
	 * Whether the prejoin camera is on. See {@link microphoneEnabled}.
	 * @internal
	 */
	readonly cameraEnabled: Signal<boolean> = computed(() => this.isTrackEnabled(Track.Kind.Video));

	private log: ILogger = inject(LoggerService).get('LocalTrackService');

	/**
	 * Readonly signal indicating whether the background processor is available.
	 * Delegates to VideoTrackProcessorService.
	 */
	readonly isBackgroundProcessorSupported: Signal<boolean> =
		this.videoTrackProcessorService.isBackgroundProcessorSupported;

	/**
	 * Sets the local tracks for the OpenVidu service.
	 *
	 * @param tracks - An array of LocalTrack objects representing the local tracks to be set.
	 * @returns void
	 * @internal
	 */
	setLocalTracks(tracks: LocalTrack[]): void {
		this._localTracks.set(tracks.filter((track) => track !== undefined) as LocalTrack[]);
		this.tracksAcquired = true;
	}

	/**
	 * @internal
	 * @returns
	 */
	getLocalTracks(): LocalTrack[] {
		return this._localTracks();
	}

	/** @internal */
	setPrejoinActive(active: boolean): void {
		this._prejoinActive.set(active);
	}

	/**
	 * Stops and detaches the prejoin tracks and clears the reference. Use when the tracks are being
	 * discarded (e.g. leaving the prejoin without joining).
	 * @internal
	 **/
	removeLocalTracks(): void {
		this._localTracks().forEach((track) => {
			track.stop();
			track.detach();
		});
		this._localTracks.set([]);
		this.tracksAcquired = false;
	}

	/**
	 * Clears the prejoin track reference WITHOUT stopping the tracks. Used after {@link connect}
	 * publishes them: the tracks live on as the participant's publications, only the prejoin
	 * reference is released so the media-state computeds hand off to the connected participant.
	 * @internal
	 **/
	clearLocalTracksReference(): void {
		this._localTracks.set([]);
	}

	/**
	 * Creates local tracks for video and audio devices.
	 *
	 * @param videoDeviceId - The ID of the video device to use. If not provided, the default video device will be used.
	 * @param audioDeviceId - The ID of the audio device to use. If not provided, the default audio device will be used.
	 * @returns A promise that resolves to an array of LocalTrack objects representing the created tracks.
	 * @internal
	 */
	async createLocalTracks(
		videoDeviceId: string | boolean | undefined = undefined,
		audioDeviceId: string | boolean | undefined = undefined
	): Promise<LocalTrack[]> {
		// Default to the participant's current intent (availability-independent). Whether a device is
		// actually opened — and which one — is resolved by the per-kind logic below; on first visit the
		// device list is still empty, so a default-device request is issued to obtain permission.
		videoDeviceId ??= this.mediaIntent.cameraEnabled();
		audioDeviceId ??= this.mediaIntent.microphoneEnabled();

		const options: CreateLocalTracksOptions = {
			audio: { ...MICROPHONE_CAPTURE_DEFAULTS },
			video: { ...CAMERA_CAPTURE_DEFAULTS }
		};

		// Video device. An empty device list means either "permission not granted yet" — labels, and
		// therefore the list, only exist once it is — or "no camera at all", and the two are not
		// distinguishable from here. Both are served by keeping the default-device request set above:
		// on a first visit it is what grants permission, and a missing camera simply fails that
		// request, which requestTracks absorbs.
		if (videoDeviceId === true) {
			if (this.deviceService.hasVideoDevices()) {
				const selectedCamera = this.deviceService.cameraSelected();
				options.video = {
					...CAMERA_CAPTURE_DEFAULTS,
					deviceId: this.toDeviceConstraint(selectedCamera?.device)
				} as VideoCaptureOptions;
			}
		} else if (videoDeviceId === false) {
			options.video = false;
		} else {
			(options.video as VideoCaptureOptions).deviceId = this.toDeviceConstraint(videoDeviceId);
		}

		// Audio device. See the video branch for why an empty device list keeps the default request.
		if (audioDeviceId === true) {
			if (this.deviceService.hasAudioDevices()) {
				const selectedMic = this.deviceService.microphoneSelected();
				(options.audio as AudioCaptureOptions).deviceId = this.toDeviceConstraint(selectedMic?.device);
			}
		} else if (audioDeviceId === false) {
			options.audio = false;
		} else {
			(options.audio as AudioCaptureOptions).deviceId = this.toDeviceConstraint(audioDeviceId);
		}

		let newLocalTracks: LocalTrack[] = [];

		if (options.audio || options.video) {
			this.log.d('Creating local tracks with options', options);
			newLocalTracks = await this.requestTracks(options);

			const videoTrack = newLocalTracks.find((t) => t.kind === Track.Kind.Video) as LocalVideoTrack | undefined;

			if (videoTrack) {
				await this.videoTrackProcessorService.applyToVideoTrack(videoTrack);
			}

			// Mute tracks when the intent is "off". This is availability-independent so a freshly
			// created track isn't muted before devices have been enumerated.
			if (!this.mediaIntent.cameraEnabled()) {
				newLocalTracks.find((t) => t.kind === Track.Kind.Video)?.mute();
			}

			if (!this.mediaIntent.microphoneEnabled()) {
				newLocalTracks.find((t) => t.kind === Track.Kind.Audio)?.mute();
			}
		}

		return newLocalTracks;
	}

	/**
	 * Asks for every wanted device in one `getUserMedia`, which costs a single browser permission
	 * prompt. That request is all-or-nothing, so a camera held by another application would take the
	 * microphone down with it: only then is each device asked for on its own. A denied permission is
	 * never retried — the prompt would come back asking for an answer already given.
	 * @internal
	 */
	private async requestTracks(options: CreateLocalTracksOptions): Promise<LocalTrack[]> {
		try {
			return await this.livekitSdkService.createLocalTracks(options);
		} catch (error) {
			const denied = MediaDeviceFailure.getFailure(error) === MediaDeviceFailure.PermissionDenied;

			if (denied || !options.audio || !options.video) {
				this.log.w('Failed to create the local tracks:', error);
				return [];
			}

			this.log.w('Failed to create both local tracks at once, asking device by device:', error);

			return this.requestTracksDeviceByDevice(options);
		}
	}

	private async requestTracksDeviceByDevice(options: CreateLocalTracksOptions): Promise<LocalTrack[]> {
		const tracks: LocalTrack[] = [];

		for (const deviceOptions of [{ video: options.video }, { audio: options.audio }]) {
			try {
				tracks.push(...(await this.livekitSdkService.createLocalTracks(deviceOptions)));
			} catch (error) {
				this.log.w('Failed to create a local track, the device may be busy:', error);
			}
		}

		return tracks;
	}

	private toDeviceConstraint(deviceId?: string): ConstrainDOMString {
		if (!deviceId || deviceId === 'default') {
			return { ideal: 'default' };
		}

		return { exact: deviceId };
	}

	/**
	 * @internal
	 * As the Room is not created yet, we need to handle the media tracks with a temporary array of tracks.
	 * This method must be only called from the prejoin component.
	 **/
	async setVideoTrackEnabled(enabled: boolean) {
		await this.setTrackEnabled(Track.Kind.Video, enabled);
	}

	/**
	 * @internal
	 * As the Room is not created yet, we need to handle the media tracks with a temporary array of tracks.
	 * This method must be only called from the prejoin component.
	 **/
	async setAudioTrackEnabled(enabled: boolean) {
		await this.setTrackEnabled(Track.Kind.Audio, enabled);
	}

	/**
	 * Turns the prejoin track of the given kind on or off. Enabling a device that was never opened —
	 * joined with `initial-video-active="false"`, or the stored preference was off, so
	 * `createLocalTracks()` skipped it — acquires it here.
	 *
	 * That acquisition used to live in the prejoin component's `onVideoEnabledChanged` handler, i.e.
	 * behind a UI click: an embedded host calling `mediaToggleVideo(true)` reached only the
	 * mute/unmute branch, found no track, and silently did nothing.
	 */
	private async setTrackEnabled(kind: Track.Kind, enabled: boolean): Promise<void> {
		const track = this._localTracks().find((t) => t.kind === kind);

		if (!enabled) {
			await track?.mute();
			this.notifyEnabledStateChanged();
			return;
		}

		if (track) {
			await track.unmute();
			this.notifyEnabledStateChanged();
			return;
		}

		await this.openTrack(kind);
	}

	/**
	 * Opens the device of the given kind and adds it to the prejoin tracks. Whether the fresh track
	 * starts muted is decided by `createLocalTracks` from the stored preference, which is why the
	 * media-control facade records the preference before asking for the change.
	 */
	private async openTrack(kind: Track.Kind): Promise<void> {
		const isAudio = kind === Track.Kind.Audio;
		const created = await this.createLocalTracks(!isAudio, isAudio);
		const track = created.find((t) => t.kind === kind);

		if (!track) {
			this.log.w(`Could not open the ${isAudio ? 'microphone' : 'camera'}: no track was created`);
			return;
		}

		this._localTracks.update((tracks) => [...tracks, track]);
	}

	/**
	 * Enabled state of the prejoin track of the given kind. With no tracks at all — still
	 * initializing, or the device was unavailable — it falls back to the intent, device availability
	 * included.
	 */
	private isTrackEnabled(kind: Track.Kind): boolean {
		const tracks = this._localTracks();

		if (!this.tracksAcquired && tracks.length === 0) {
			return kind === Track.Kind.Audio
				? this.deviceService.isMicrophoneEnabled()
				: this.deviceService.isCameraEnabled();
		}

		const track = tracks.find((t) => t.kind === kind);
		return !!track && !track.isMuted && !!track.mediaStreamTrack?.enabled;
	}

	/**
	 * Re-emits the track array so {@link microphoneEnabled}/{@link cameraEnabled} re-evaluate.
	 * `mute()`/`unmute()` flip `isMuted` on the track object in place, which the array signal cannot
	 * see on its own.
	 */
	private notifyEnabledStateChanged(): void {
		this._localTracks.update((tracks) => [...tracks]);
	}

	/**
	 * Switches the camera device in prejoin (room not yet connected).
	 *
	 * Uses `LocalVideoTrack.restartTrack({ deviceId })` on the existing track when available.
	 * This is the correct LiveKit pattern: `restartTrack` internally calls `setMediaStreamTrack`,
	 * which automatically calls `processor.restart(newTrack)` if a background processor is
	 * attached — preserving any active virtual-background effect without extra work.
	 *
	 * Falls back to creating a new track (with processor reattachment) when no track exists.
	 * @param deviceId - The new video device ID
	 * @internal
	 */
	async switchCamera(deviceId: string): Promise<void> {
		const existingTrack = this._localTracks().find((t) => t.kind === Track.Kind.Video) as
			| LocalVideoTrack
			| undefined;
		// restartTrack replaces the whole constraint set, so the capture profile has to be restated
		// or the switched camera would fall back to the browser's default resolution.
		const options: VideoCaptureOptions = {
			...CAMERA_CAPTURE_DEFAULTS,
			deviceId: this.toDeviceConstraint(deviceId)
		};

		if (existingTrack) {
			try {
				// restartTrack replaces the underlying MediaStreamTrack in-place.
				// LiveKit's setMediaStreamTrack will call processor.restart(newTrack) automatically
				// if a background processor is attached, preserving the active effect.
				await existingTrack.restartTrack(options);

				if (!this.deviceService.isCameraEnabled()) {
					// restartTrack re-acquired the device. mute() returns early on an already-muted
					// track, so the camera would stay open — light on — behind a UI that says it is
					// off; stop the re-acquired capture explicitly. Unmuting re-acquires it anyway.
					await existingTrack.mute();
					existingTrack.mediaStreamTrack.stop();
				}

				// restartTrack mutated the track in place (same LocalVideoTrack object), so emit a new
				// array reference for the enabled computeds to re-read it.
				this._localTracks.update((tracks) => [...tracks]);
				this.log.d('Camera switched via restartTrack:', deviceId);
			} catch (error) {
				this.log.e('Failed to switch camera via restartTrack:', error);
				throw error;
			}

			return;
		}

		// No existing track (edge case: camera was unavailable/unpublished) → create a fresh one
		try {
			const newVideoTracks = await this.livekitSdkService.createLocalTracks({ video: options });
			const videoTrack = newVideoTracks.find((t) => t.kind === Track.Kind.Video) as LocalVideoTrack | undefined;

			if (videoTrack) {
				if (!this.deviceService.isCameraEnabled()) {
					await videoTrack.mute();
				}

				// Attach processor (and restore active background if any) to the fresh track
				await this.videoTrackProcessorService.applyToVideoTrack(videoTrack);
				this._localTracks.update((tracks) => [...tracks, videoTrack]);
				this.log.d('New camera track created and added:', deviceId);
			}
		} catch (error) {
			this.log.e('Failed to create new video track:', error);
			const message = error instanceof Error ? error.message : 'Unknown error';
			throw new Error(`Failed to switch camera: ${message}`, { cause: error });
		}
	}

	/**
	 * Switches the microphone device in prejoin (room not yet connected).
	 *
	 * Uses `LocalAudioTrack.restartTrack({ deviceId })` on the existing track when available,
	 * preserving echo-cancellation, noise-suppression and auto-gain-control constraints.
	 * Falls back to creating a new audio track when none exists.
	 * @param deviceId - The new audio device ID
	 * @internal
	 */
	async switchMicrophone(deviceId: string): Promise<void> {
		const existingTrack = this._localTracks().find((t) => t.kind === Track.Kind.Audio) as
			| LocalAudioTrack
			| undefined;
		const options: AudioCaptureOptions = {
			...MICROPHONE_CAPTURE_DEFAULTS,
			deviceId: this.toDeviceConstraint(deviceId)
		};

		if (existingTrack) {
			try {
				await existingTrack.restartTrack(options);

				if (!this.deviceService.isMicrophoneEnabled()) {
					await existingTrack.mute();
				}

				// restartTrack swapped the MediaStreamTrack in place (same LocalAudioTrack object), so
				// emit a new array reference to re-read it through microphoneMediaStreamTrack: that is
				// what re-clones the mic-activity monitor onto the new device.
				this._localTracks.update((tracks) => [...tracks]);
				this.log.d('Microphone switched via restartTrack:', deviceId);
			} catch (error) {
				this.log.e('Failed to switch microphone via restartTrack:', error);
				throw error;
			}

			return;
		}

		// No existing track (the microphone intent was "off", so none was ever opened) → create one
		try {
			const newAudioTracks = await this.livekitSdkService.createLocalTracks({ audio: options });
			const audioTrack = newAudioTracks.find((t) => t.kind === Track.Kind.Audio);

			if (audioTrack) {
				if (!this.deviceService.isMicrophoneEnabled()) {
					await audioTrack.mute();
				}

				this._localTracks.update((tracks) => [...tracks, audioTrack]);
				this.log.d('New microphone track created and added:', deviceId);
			}
		} catch (error) {
			this.log.e('Failed to create new audio track:', error);
			const message = error instanceof Error ? error.message : 'Unknown error';
			throw new Error(`Failed to switch microphone: ${message}`, { cause: error });
		}
	}
}
