import { computed, inject, Service, Signal, signal } from '@angular/core';
import { DeviceService } from '../device/device.service';
import {
	AudioCaptureOptions,
	CreateLocalTracksOptions,
	LocalAudioTrack,
	LocalTrack,
	LocalVideoTrack,
	Track,
	VideoCaptureOptions
} from '../livekit';
import { LivekitSdkService } from '../livekit/livekit-sdk.service';
import { MeetingLiveKitService } from '../meeting-livekit/meeting-livekit.service';
import { MediaStorageService } from '../storage/storage.service';
import { VideoTrackProcessorService } from '../track-processor/video-track-processor.service';
import { LoggerService } from '../../../../../shared/services/logger.service';
import type { ILogger } from '../../../../../shared/models/logger.model';

/**
 * Signal equality keyed on the underlying MediaStreamTrack id. Two track objects are "equal" when
 * they wrap the same MediaStreamTrack — so consumers re-run when the real capture track changes
 * (creation, device switch, re-acquisition) but not on a mere enabled/mute toggle of the same track.
 */
function sameMediaStreamTrack(
	a: LocalAudioTrack | LocalVideoTrack | undefined,
	b: LocalAudioTrack | LocalVideoTrack | undefined
): boolean {
	return a?.mediaStreamTrack?.id === b?.mediaStreamTrack?.id;
}

/**
 * Owns the local participant's media capture: creating/switching camera & microphone tracks
 * (prejoin and in-call) and their enabled state. The room connection itself lives separately
 * in MeetingLiveKitService.
 */
@Service()
export class LocalTrackService {
	private readonly deviceService = inject(DeviceService);
	private readonly storageService = inject(MediaStorageService);
	private readonly livekitSdkService = inject(LivekitSdkService);
	private readonly videoTrackProcessorService = inject(VideoTrackProcessorService);
	private readonly meetingLiveKitService = inject(MeetingLiveKitService);

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
	 * Current prejoin microphone track, or undefined. Equality is compared by the underlying
	 * MediaStreamTrack id, so an in-place device switch (restartTrack keeps the same LocalAudioTrack
	 * object but swaps its MediaStreamTrack) still propagates to consumers, while a mute/unmute
	 * (same MediaStreamTrack) does not churn the monitor.
	 * @internal
	 */
	readonly microphoneTrack: Signal<LocalAudioTrack | undefined> = computed(
		() => this._localTracks().find((t) => t.kind === Track.Kind.Audio) as LocalAudioTrack | undefined,
		{ equal: sameMediaStreamTrack }
	);

	/**
	 * Current prejoin camera track, or undefined. See {@link microphoneTrack} for the equality note.
	 * @internal
	 */
	readonly cameraTrack: Signal<LocalVideoTrack | undefined> = computed(
		() => this._localTracks().find((t) => t.kind === Track.Kind.Video) as LocalVideoTrack | undefined,
		{ equal: sameMediaStreamTrack }
	);

	/**
	 * Whether the prejoin microphone is on. This deliberately reads `_localTracks` instead of
	 * {@link microphoneTrack}: that signal compares by MediaStreamTrack id so a mute does not churn
	 * the mic monitor, which is exactly the transition this one has to report. Every mutation of the
	 * enabled state therefore emits a new array reference — see {@link setAudioTrackEnabled}.
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
	}

	/**
	 * @internal
	 * @returns
	 */
	getLocalTracks(): LocalTrack[] {
		return this._localTracks();
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
	 * @param allowPartialCreation - If true, allows creating tracks even if some devices fail
	 * @returns A promise that resolves to an array of LocalTrack objects representing the created tracks.
	 * @internal
	 */
	async createLocalTracks(
		videoDeviceId: string | boolean | undefined = undefined,
		audioDeviceId: string | boolean | undefined = undefined,
		allowPartialCreation = true
	): Promise<LocalTrack[]> {
		// Default to the user's stored preference (availability-independent). Whether a device is
		// actually opened — and which one — is resolved by the per-kind logic below; on first visit
		// the device list is still empty, so a default-device request is issued to obtain permission.
		videoDeviceId ??= this.storageService.isCameraEnabled();
		audioDeviceId ??= this.storageService.isMicrophoneEnabled();

		const options: CreateLocalTracksOptions = {
			audio: { echoCancellation: true, noiseSuppression: true },
			video: {}
		};

		// Video device
		if (videoDeviceId === true) {
			if (this.deviceService.hasVideoDevices()) {
				const selectedCamera = this.deviceService.cameraSelected();
				options.video = { deviceId: this.toDeviceConstraint(selectedCamera?.device) } as VideoCaptureOptions;
			} else if (!this.deviceService.hasVideoPermission()) {
				// Permission not granted yet (e.g. first visit): request the default camera so this
				// call obtains permission. The caller enumerates devices afterwards.
				options.video = {} as VideoCaptureOptions;
			} else {
				// Permission granted but no camera present.
				options.video = false;
			}
		} else if (videoDeviceId === false) {
			options.video = false;
		} else {
			(options.video as VideoCaptureOptions).deviceId = this.toDeviceConstraint(videoDeviceId);
		}

		// Audio device
		if (audioDeviceId === true) {
			if (this.deviceService.hasAudioDevices()) {
				const selectedMic = this.deviceService.microphoneSelected();
				(options.audio as AudioCaptureOptions).deviceId = this.toDeviceConstraint(selectedMic?.device);
			} else if (!this.deviceService.hasAudioPermission()) {
				// Permission not granted yet: keep the default-device audio request (set above) so
				// this call can obtain permission. The caller enumerates devices afterwards.
			} else {
				// Permission granted but no microphone present.
				options.audio = false;
			}
		} else if (audioDeviceId === false) {
			options.audio = false;
		} else {
			(options.audio as AudioCaptureOptions).deviceId = this.toDeviceConstraint(audioDeviceId);
		}

		let newLocalTracks: LocalTrack[] = [];

		if (options.audio || options.video) {
			this.log.d('Creating local tracks with options', options);

			if (allowPartialCreation) {
				// Try to create tracks separately to handle device conflicts gracefully
				newLocalTracks = await this.createTracksWithFallback(options);
			} else {
				// Original behavior - all or nothing
				newLocalTracks = await this.livekitSdkService.createLocalTracks(options);
			}

			const videoTrack = newLocalTracks.find((t) => t.kind === Track.Kind.Video) as LocalVideoTrack | undefined;

			if (videoTrack) {
				await this.videoTrackProcessorService.applyToVideoTrack(videoTrack);
			}

			// Mute tracks when the user's stored preference is "off". This is availability-independent
			// so a freshly created track isn't muted before devices have been enumerated.
			if (!this.storageService.isCameraEnabled()) {
				newLocalTracks.find((t) => t.kind === Track.Kind.Video)?.mute();
			}

			if (!this.storageService.isMicrophoneEnabled()) {
				newLocalTracks.find((t) => t.kind === Track.Kind.Audio)?.mute();
			}
		}

		return newLocalTracks;
	}

	/**
	 * Creates tracks with fallback strategy to handle device conflicts
	 * @param options - The track creation options
	 * @returns Array of successfully created tracks
	 * @internal
	 */
	private async createTracksWithFallback(options: CreateLocalTracksOptions): Promise<LocalTrack[]> {
		const tracks: LocalTrack[] = [];

		// Try to create video track separately
		if (options.video) {
			try {
				const videoTracks = await this.livekitSdkService.createLocalTracks({ video: options.video });
				tracks.push(...videoTracks);
				this.log.d('Video track created successfully');
			} catch (error) {
				this.log.w('Failed to create video track, device may be busy:', error);
				// Still continue to try audio track
			}
		}

		// Try to create audio track separately
		if (options.audio) {
			try {
				const audioTracks = await this.livekitSdkService.createLocalTracks({ audio: options.audio });
				tracks.push(...audioTracks);
				this.log.d('Audio track created successfully');
			} catch (error) {
				this.log.w('Failed to create audio track, device may be busy:', error);
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
	 * joined with `initial-video-muted`, or the stored preference was off, so `createLocalTracks()`
	 * skipped it — acquires it here.
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
	 * initializing, or the device was unavailable — it falls back to what the participant asked for,
	 * device availability included.
	 */
	private isTrackEnabled(kind: Track.Kind): boolean {
		const tracks = this._localTracks();

		if (tracks.length === 0) {
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
		const options: VideoCaptureOptions = { deviceId: this.toDeviceConstraint(deviceId) };

		if (existingTrack) {
			try {
				// restartTrack replaces the underlying MediaStreamTrack in-place.
				// LiveKit's setMediaStreamTrack will call processor.restart(newTrack) automatically
				// if a background processor is attached, preserving the active effect.
				await existingTrack.restartTrack(options);

				if (!this.deviceService.isCameraEnabled()) {
					await existingTrack.mute();
				}

				// restartTrack swapped the MediaStreamTrack in place (same LocalVideoTrack object), so
				// emit a new array reference to re-run the cameraTrack computed (which compares by MST id).
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
			deviceId: this.toDeviceConstraint(deviceId),
			echoCancellation: true,
			noiseSuppression: true,
			autoGainControl: true
		};

		if (existingTrack) {
			try {
				await existingTrack.restartTrack(options);

				if (!this.deviceService.isMicrophoneEnabled()) {
					await existingTrack.mute();
				}

				// restartTrack swapped the MediaStreamTrack in place (same LocalAudioTrack object), so
				// emit a new array reference to re-run the microphoneTrack computed (MST-id equality):
				// this is what re-clones the mic-activity monitor onto the new device.
				this._localTracks.update((tracks) => [...tracks]);
				this.log.d('Microphone switched via restartTrack:', deviceId);
			} catch (error) {
				this.log.e('Failed to switch microphone via restartTrack:', error);
				throw error;
			}

			return;
		}

		// No existing track (edge case) → create a fresh one
		try {
			const newAudioTracks = await this.livekitSdkService.createLocalTracks(options as CreateLocalTracksOptions);
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

	/**
	 * Gets the current video track from local tracks or room.
	 * @returns LocalVideoTrack or undefined
	 * @internal
	 */
	async getCurrentVideoTrack(): Promise<LocalVideoTrack | undefined> {
		// First try to get from local tracks (prejoin state)
		let videoTrack = this._localTracks().find((t) => t.kind === Track.Kind.Video) as LocalVideoTrack | undefined;

		// If not found and room is connected, get from published tracks
		if (!videoTrack && this.meetingLiveKitService.isConnected()) {
			const localParticipant = this.meetingLiveKitService.getRoom().localParticipant;
			const videoPublication = localParticipant
				.getTrackPublications()
				.find((pub) => pub.kind === Track.Kind.Video);
			videoTrack = videoPublication?.track as LocalVideoTrack | undefined;
		}

		return videoTrack;
	}
}
