import { computed, inject, Service, Signal, signal } from '@angular/core';
import { CAMERA_CAPTURE_DEFAULTS, MICROPHONE_CAPTURE_DEFAULTS } from '../../models/media-capture.model';
import { ParticipantModel } from '../../models/participant.model';
import { MeetingUiConfigService } from '../config/meeting-ui-config.service';
import { DeviceService } from '../device/device.service';
import { StreamLayoutStateService } from '../layout/stream-layout-state.service';
import type {
	AudioCaptureOptions,
	CreateLocalTracksOptions,
	LocalAudioTrack,
	LocalTrack,
	LocalVideoTrack,
	ScreenShareCaptureOptions,
	VideoCaptureOptions
} from '../livekit';
import { Track, VideoPresets } from '../livekit';
import { LivekitSdkService } from '../livekit/livekit-sdk.service';
import { MeetingLiveKitService } from '../meeting-livekit/meeting-livekit.service';
import { ParticipantService } from '../participant/participant.service';
import { MediaStorageService } from '../storage/storage.service';
import { VideoTrackProcessorService } from '../track-processor/video-track-processor.service';
import { LoggerService } from '../../../../../shared/services/logger.service';
import type { ILogger } from '../../../../../shared/models/logger.model';

/**
 * Single owner of the local participant's media across both phases of the app: the prejoin tracks
 * (created before the Room exists), the camera/microphone/screen-share toggles and device switches,
 * the reactive {@link cameraTrack}/{@link microphoneMediaStreamTrack} signals, and the persistence
 * of the camera/microphone preference.
 *
 * Toggling and switching behave differently before the Room exists (operate on the prejoin tracks)
 * versus after connecting (operate on the published participant). That duality is resolved in
 * exactly one place — {@link connectedParticipant} — and every public method branches through it.
 * The room connection itself lives separately in {@link MeetingLiveKitService}, and the participant
 * registry in {@link ParticipantService}.
 */
@Service()
export class LocalMediaService {
	private readonly deviceService = inject(DeviceService);
	private readonly storageService = inject(MediaStorageService);
	private readonly livekitSdkService = inject(LivekitSdkService);
	private readonly videoTrackProcessorService = inject(VideoTrackProcessorService);
	private readonly meetingLiveKitService = inject(MeetingLiveKitService);
	private readonly participantService = inject(ParticipantService);
	private readonly uiConfigService = inject(MeetingUiConfigService);
	private readonly streamLayoutService = inject(StreamLayoutStateService);
	private readonly log: ILogger = inject(LoggerService).get('LocalMediaService');

	/*
	 * Tracks used in the prejoin phase, before the Room exists. Reactive source of truth for that
	 * phase: mutating it re-drives the track signals below, which feed the mic-activity monitor.
	 * Always mutate through the signal (set/update) — never push into the array in place, or the
	 * signal would not notify.
	 */
	private readonly _prejoinTracks = signal<LocalTrack[]>([]);

	/**
	 * Whether the prejoin/join acquisition has already run. Before it does, the enabled state can
	 * only be predicted from the stored preference; afterwards the tracks are the truth, so a device
	 * that could not be opened (busy, unplugged, permission revoked) is not reported as enabled.
	 */
	private prejoinMediaAcquired = false;

	/**
	 * The camera track in effect right now (prejoin or meeting), or undefined.
	 *
	 * Prejoin reads the temporary local tracks; once the participant connects it takes over (kept
	 * reactive through the model's `_revision`/`bump()` mechanism), and after the prejoin reference
	 * is released (see {@link releaseJoinTracks}) the two never disagree — publishing hands over the
	 * very same track object.
	 *
	 * A device switch swaps the MediaStreamTrack *inside* this object (`restartTrack`), so the value
	 * of this signal is unchanged by a switch and consumers are not notified: livekit-client
	 * re-attaches the new MediaStreamTrack to the already-attached video elements, and the ones that
	 * must follow the real capture use {@link microphoneMediaStreamTrack} instead.
	 */
	readonly cameraTrack: Signal<LocalVideoTrack | undefined> = computed(() => {
		const local = this.participantService.localParticipant();

		if (local) return local.getCameraTrack();

		return this.prejoinCameraTrack();
	});

	/**
	 * The MediaStreamTrack the microphone is capturing right now (prejoin or meeting), or undefined.
	 *
	 * Consumers that own something derived from the raw capture — MicActivityService clones it to
	 * power the "speaking while muted" warning — must depend on this and not on the LocalAudioTrack:
	 * a device switch swaps the MediaStreamTrack in place, keeping the same LocalAudioTrack object,
	 * so a signal of tracks holds the same value before and after the switch and cannot notify.
	 * Muting does not swap the capture track (the room publishes with `stopMicTrackOnMute: false`),
	 * so a mute/unmute leaves this signal — and the monitor — untouched.
	 */
	readonly microphoneMediaStreamTrack: Signal<MediaStreamTrack | undefined> = computed(() => {
		const local = this.participantService.localParticipant();

		if (local) return local.getMicrophoneTrack()?.mediaStreamTrack;

		return this.prejoinMicrophoneTrack()?.mediaStreamTrack;
	});

	/*
	 * Plain readers rather than computed signals on purpose: a computed whose value is the same track
	 * object does not notify, so anything derived from it — the capture signal above — would never see
	 * an in-place MediaStreamTrack swap. Read through a method and the dependency on `_prejoinTracks`
	 * is registered by whichever computed is doing the reading.
	 */
	private prejoinMicrophoneTrack(): LocalAudioTrack | undefined {
		return this._prejoinTracks().find((t) => t.kind === Track.Kind.Audio) as LocalAudioTrack | undefined;
	}

	private prejoinCameraTrack(): LocalVideoTrack | undefined {
		return this._prejoinTracks().find((t) => t.kind === Track.Kind.Video) as LocalVideoTrack | undefined;
	}

	/**
	 * The single prejoin-vs-room branching point: the connected local participant when the Room is
	 * connected AND the local participant exists; undefined while still in prejoin.
	 */
	private connectedParticipant(): ParticipantModel | undefined {
		const local = this.participantService.localParticipant();
		return this.meetingLiveKitService.isConnected() && local ? local : undefined;
	}

	/**
	 * Whether the prejoin tracks are the legitimate target of a media operation, i.e. no participant
	 * has been published yet.
	 *
	 * {@link connectedParticipant} additionally requires the Room to report `Connected`, which it
	 * does not while a dropped connection is being resumed (`SignalReconnecting`/`Reconnecting`) —
	 * so a toggle can reach the prejoin branch in the middle of a meeting. Acting on the prejoin
	 * tracks there is harmless (there are none), but *opening* a device would leave a capture track
	 * that nobody publishes and nobody stops: the camera light stays on for the rest of the session.
	 */
	private isPrejoinPhase(): boolean {
		return !this.participantService.localParticipant();
	}

	/* ------------------------------ Prejoin lifecycle ------------------------------ */

	/**
	 * Creates the prejoin tracks from the user's stored preferences and populates the device list.
	 * Creating the tracks is what grants media permission on first visit; only then are device
	 * labels available, so the device list is synced right after.
	 * @internal
	 */
	async initPrejoinMedia(): Promise<void> {
		const tracks = await this.createLocalTracks();
		this.setPrejoinTracks(tracks);
		await this.deviceService.syncDevicesAfterTrackCreation(tracks);
	}

	/**
	 * Stops and detaches the prejoin tracks and clears the reference. Use when the tracks are being
	 * discarded (leaving the prejoin without joining). Clearing the signal drops
	 * {@link cameraTrack}/{@link microphoneMediaStreamTrack} to undefined, which detaches the
	 * mic-activity monitor automatically.
	 * @internal
	 */
	discardPrejoinMedia(): void {
		this._prejoinTracks().forEach((track) => {
			track.stop();
			track.detach();
		});
		this._prejoinTracks.set([]);
		this.prejoinMediaAcquired = false;
	}

	/**
	 * Returns the tracks to publish on join: the prejoin tracks when the prejoin ran, otherwise
	 * tracks created from the user's stored preferences — the single getUserMedia of the no-prejoin
	 * path (availability-independent: on first visit the device list is empty until permission is
	 * granted by this very call, so the device list is synced right after).
	 * @internal
	 */
	async acquireJoinTracks(): Promise<LocalTrack[]> {
		const prejoinTracks = this._prejoinTracks();

		if (prejoinTracks.length > 0) return prejoinTracks;

		const wantCamera = this.uiConfigService.isVideoEnabled() && this.storageService.isCameraEnabled();
		const wantMicrophone = this.uiConfigService.isAudioEnabled() && this.storageService.isMicrophoneEnabled();

		if (!wantCamera && !wantMicrophone) return [];

		const tracks = await this.createLocalTracks(wantCamera, wantMicrophone);
		// Held like prejoin tracks so a retried join reuses them instead of opening the devices
		// again, and so a failed connection can still release them through discardPrejoinMedia().
		this.setPrejoinTracks(tracks);
		await this.deviceService.syncDevicesAfterTrackCreation(tracks);

		return tracks;
	}

	/**
	 * Releases the prejoin track reference WITHOUT stopping the tracks. Call once the tracks have
	 * been published: they live on as the participant's publications, and {@link cameraTrack}/
	 * {@link microphoneMediaStreamTrack} hand off from the prejoin signal to the connected
	 * participant — the mic-activity monitor keeps the same underlying MediaStreamTrack.
	 * @internal
	 */
	releaseJoinTracks(): void {
		this._prejoinTracks.set([]);
	}

	private setPrejoinTracks(tracks: LocalTrack[]): void {
		this._prejoinTracks.set(tracks);
		this.prejoinMediaAcquired = true;
	}

	/* ------------------------------ Camera / microphone control ------------------------------ */

	/**
	 * Sets the local participant camera enabled or disabled. In prejoin, enabling with no camera
	 * track yet creates one.
	 */
	async setCameraEnabled(enabled: boolean): Promise<void> {
		const local = this.connectedParticipant();

		if (local) {
			const storageDevice = this.storageService.getVideoDevice();
			let options: VideoCaptureOptions | undefined;

			if (storageDevice) {
				options = {
					...CAMERA_CAPTURE_DEFAULTS,
					deviceId: storageDevice.device,
					facingMode: 'user'
				};
			}

			// Enabling re-acquires the underlying MediaStreamTrack, so bump the model's revision —
			// that is what re-drives the reactive media state and, through it, the mic-activity monitor.
			await local.setCameraEnabled(enabled, options);
			local.bump();
		} else if (this.isPrejoinPhase()) {
			await this.setPrejoinCameraEnabled(enabled);
		}

		// Persisted here because a call to this method always represents user/app intent; paths that
		// change the camera without it (a moderator force-mute) must not overwrite the preference.
		this.storageService.setCameraEnabled(enabled);
	}

	/**
	 * Sets the local participant microphone enabled or disabled. In prejoin, enabling with no
	 * microphone track yet creates one.
	 */
	async setMicrophoneEnabled(enabled: boolean): Promise<void> {
		const local = this.connectedParticipant();

		if (local) {
			const storageDevice = this.storageService.getAudioDevice();
			let options: AudioCaptureOptions | undefined;

			if (storageDevice) {
				options = { ...MICROPHONE_CAPTURE_DEFAULTS, deviceId: storageDevice.device };
			}

			await local.setMicrophoneEnabled(enabled, options);
			local.bump();
		} else if (this.isPrejoinPhase()) {
			await this.setPrejoinMicrophoneEnabled(enabled);
		}

		// See setCameraEnabled for why the preference is persisted here.
		this.storageService.setMicrophoneEnabled(enabled);
	}

	/**
	 * Switches the active camera track to the given device id.
	 */
	async switchCamera(deviceId: string): Promise<void> {
		const local = this.connectedParticipant();

		if (local) {
			await local.switchCamera(deviceId);
			local.bump();
		} else if (this.isPrejoinPhase()) {
			await this.switchPrejoinCamera(deviceId);
		}
	}

	/**
	 * Switches the active microphone track to the given device id.
	 */
	async switchMicrophone(deviceId: string): Promise<void> {
		const local = this.connectedParticipant();

		if (local) {
			await local.switchMicrophone(deviceId);
			local.bump();
		} else if (this.isPrejoinPhase()) {
			await this.switchPrejoinMicrophone(deviceId);
		}
	}

	/**
	 * Returns if the local participant camera is enabled. In prejoin, the enabled state also
	 * honours the embedding app's directive inputs and the stored preference.
	 */
	isMyCameraEnabled(): boolean {
		const local = this.connectedParticipant();

		if (local) return local.isCameraEnabled;

		if (!this.uiConfigService.isVideoEnabled()) return false;

		return this.isPrejoinCameraTrackEnabled() && this.storageService.isCameraEnabled();
	}

	/**
	 * Returns if the local participant microphone is enabled. See {@link isMyCameraEnabled}.
	 */
	isMyMicrophoneEnabled(): boolean {
		const local = this.connectedParticipant();

		if (local) return local.isMicrophoneEnabled;

		if (!this.uiConfigService.isAudioEnabled()) return false;

		return this.isPrejoinMicrophoneTrackEnabled() && this.storageService.isMicrophoneEnabled();
	}

	/**
	 * Applies the embedding app's `videoEnabled` input as the initial camera preference and returns
	 * the resolved state. It runs before any track exists and never opens or closes a device: an
	 * input of `true` defers to a stored "off" preference, `false` forces the camera off.
	 */
	applyInitialCameraPreference(enabled: boolean): boolean {
		const resolved = enabled && this.storageService.isCameraEnabled();
		this.storageService.setCameraEnabled(resolved);

		return resolved;
	}

	/**
	 * Applies the embedding app's `audioEnabled` input as the initial microphone preference.
	 * See {@link applyInitialCameraPreference}.
	 */
	applyInitialMicrophonePreference(enabled: boolean): boolean {
		const resolved = enabled && this.storageService.isMicrophoneEnabled();
		this.storageService.setMicrophoneEnabled(resolved);

		return resolved;
	}

	/* ------------------------------ Screen share (room-only) ------------------------------ */

	/**
	 * Returns if the local participant screen is enabled.
	 */
	isMyScreenShareEnabled(): boolean {
		return this.participantService.localParticipant()?.isScreenShareEnabled || false;
	}

	/**
	 * Switches the active screen share track showing a native browser dialog to select a screen or window.
	 */
	async switchScreenShare(): Promise<void> {
		const localParticipant = this.participantService.localParticipant();

		if (!localParticipant) {
			this.log.e('Local participant is undefined when switching screenshare');
			return;
		}

		// Chrome / Safari: seamless replaceTrack keeps the same publication SID.
		const options = this.getScreenCaptureOptions();
		const [newTrack] = await localParticipant.createScreenTracks(options);

		if (newTrack) {
			newTrack.addListener('ended', async () => {
				this.log.d('Clicked native stop button. Stopping screen sharing');
				await this.setScreenShareEnabled(false);
			});

			try {
				await localParticipant.switchScreenshare(newTrack);
			} catch (error) {
				newTrack.stop();
				throw error;
			}
		}
	}

	/**
	 * Share or unshare the local participant screen.
	 * @param enabled: true to share the screen, false to unshare it
	 */
	async setScreenShareEnabled(enabled: boolean): Promise<void> {
		const localParticipant = this.participantService.localParticipant();
		const options = this.getScreenCaptureOptions();
		const track = await localParticipant?.setScreenShareEnabled(enabled, options);

		if (enabled && track) {
			// Set all videos to normal size when a local screen is shared
			this.streamLayoutService.unpinAllStreams();
			this.streamLayoutService.toggleStreamPinned(track.trackSid);
			this.streamLayoutService.recordScreenSharePublication(track.trackSid, new Date().getTime());

			track?.addListener('ended', async () => {
				this.log.d('Clicked native stop button. Stopping screen sharing');
				await this.setScreenShareEnabled(false);
			});
		} else if (!enabled && track) {
			// Enlarge the last screen shared when a local screen is stopped
			this.streamLayoutService.clearScreenSharePublication(track.trackSid);
			this.streamLayoutService.unpinAllStreams();
			this.streamLayoutService.setLastScreenPinned();
		}

		localParticipant?.bump();
	}

	private getScreenCaptureOptions(): ScreenShareCaptureOptions {
		return {
			audio: true,
			video: {
				displaySurface: 'browser' // Set browser tab as default options
			},
			systemAudio: 'include', // Include system audio as an option
			resolution: VideoPresets.h1080.resolution,
			contentHint: 'text', // Optimized for detailed content, adjust based on use case
			suppressLocalAudioPlayback: true, // Prevent echo by not playing local audio
			selfBrowserSurface: 'exclude', // Avoid self capture to prevent mirror effect
			surfaceSwitching: 'include', // Allow users to switch shared tab dynamically
			preferCurrentTab: false // Do not force current tab to be selected
		};
	}

	/* ------------------------------ Prejoin implementation ------------------------------ */

	private async setPrejoinCameraEnabled(enabled: boolean): Promise<void> {
		const videoTrack = this.prejoinCameraTrack();

		if (videoTrack) {
			if (enabled) {
				await videoTrack.unmute();
			} else {
				await videoTrack.mute();
			}

			return;
		}

		if (!enabled) return;

		// Opened enabled on purpose: the stored preference still says "off" at this point, and
		// creating the track muted would stop the camera we just opened, so unmuting it afterwards
		// would re-acquire the device — two getUserMedia calls and a camera-light blink per click.
		const created = await this.createLocalTracks(true, false, { applyStoredMuteState: false });
		const newTrack = created.find((t) => t.kind === Track.Kind.Video);

		if (newTrack) {
			this._prejoinTracks.update((tracks) => [...tracks, newTrack]);
		}
	}

	private async setPrejoinMicrophoneEnabled(enabled: boolean): Promise<void> {
		const audioTrack = this.prejoinMicrophoneTrack();

		if (audioTrack) {
			if (enabled) {
				await audioTrack.unmute();
			} else {
				await audioTrack.mute();
			}

			return;
		}

		if (!enabled) return;

		// See setPrejoinCameraEnabled: opened enabled, because the stored preference still says "off".
		const created = await this.createLocalTracks(false, true, { applyStoredMuteState: false });
		const newTrack = created.find((t) => t.kind === Track.Kind.Audio);

		if (newTrack) {
			this._prejoinTracks.update((tracks) => [...tracks, newTrack]);
		}
	}

	/** Whether the camera should be opened: a stored "enabled" preference AND a camera being present. */
	private shouldOpenCamera(): boolean {
		return this.deviceService.hasVideoDevices() && this.storageService.isCameraEnabled();
	}

	/** Whether the microphone should be opened. See {@link shouldOpenCamera}. */
	private shouldOpenMicrophone(): boolean {
		return this.deviceService.hasAudioDevices() && this.storageService.isMicrophoneEnabled();
	}

	private isPrejoinCameraTrackEnabled(): boolean {
		// Before anything has been acquired the state can only be predicted from the preference;
		// afterwards the track is the truth, so a camera that failed to open reads as disabled.
		if (!this.prejoinMediaAcquired && this._prejoinTracks().length === 0) {
			return this.shouldOpenCamera();
		}

		const videoTrack = this.prejoinCameraTrack();
		return !!videoTrack && !videoTrack.isMuted && videoTrack.mediaStreamTrack?.enabled;
	}

	private isPrejoinMicrophoneTrackEnabled(): boolean {
		if (!this.prejoinMediaAcquired && this._prejoinTracks().length === 0) {
			return this.shouldOpenMicrophone();
		}

		const audioTrack = this.prejoinMicrophoneTrack();
		return !!audioTrack && !audioTrack.isMuted && audioTrack.mediaStreamTrack?.enabled;
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
	 */
	private async switchPrejoinCamera(deviceId: string): Promise<void> {
		const existingTrack = this.prejoinCameraTrack();
		// restartTrack() replaces the whole constraint set, so the capture profile has to be restated
		// or the switched camera would fall back to the browser's default resolution.
		const options: VideoCaptureOptions = {
			...CAMERA_CAPTURE_DEFAULTS,
			deviceId: this.toDeviceConstraint(deviceId)
		};

		if (existingTrack) {
			try {
				await existingTrack.restartTrack(options);

				if (!this.shouldOpenCamera()) {
					// restartTrack re-acquired the device. mute() returns early on an already-muted
					// track, so the camera would stay open — light on — behind a UI that says it is
					// off; stop the re-acquired capture explicitly. Unmuting re-acquires it anyway.
					await existingTrack.mute();
					existingTrack.mediaStreamTrack.stop();
				}

				// restartTrack swapped the MediaStreamTrack in place (same LocalVideoTrack object), so
				// emit a new array reference to re-read it through the derived capture signals.
				this._prejoinTracks.update((tracks) => [...tracks]);
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
				if (!this.shouldOpenCamera()) {
					await videoTrack.mute();
				}

				// Attach processor (and restore active background if any) to the fresh track
				await this.videoTrackProcessorService.applyToVideoTrack(videoTrack);
				this._prejoinTracks.update((tracks) => [...tracks, videoTrack]);
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
	 * Uses `LocalAudioTrack.restartTrack()` on the existing track when available, restating the
	 * shared capture profile so the switch does not drop it.
	 * Falls back to creating a new audio track when none exists.
	 */
	private async switchPrejoinMicrophone(deviceId: string): Promise<void> {
		const existingTrack = this.prejoinMicrophoneTrack();
		const options: AudioCaptureOptions = {
			...MICROPHONE_CAPTURE_DEFAULTS,
			deviceId: this.toDeviceConstraint(deviceId)
		};

		if (existingTrack) {
			try {
				await existingTrack.restartTrack(options);

				if (!this.shouldOpenMicrophone()) {
					await existingTrack.mute();
				}

				// restartTrack swapped the MediaStreamTrack in place (same LocalAudioTrack object), so
				// emit a new array reference to re-run the derived capture signal: this is what
				// re-clones the mic-activity monitor onto the new device.
				this._prejoinTracks.update((tracks) => [...tracks]);
				this.log.d('Microphone switched via restartTrack:', deviceId);
			} catch (error) {
				this.log.e('Failed to switch microphone via restartTrack:', error);
				throw error;
			}

			return;
		}

		// No existing track (the microphone preference was "off", so none was ever opened) → create one
		try {
			const newAudioTracks = await this.livekitSdkService.createLocalTracks({ audio: options });
			const audioTrack = newAudioTracks.find((t) => t.kind === Track.Kind.Audio);

			if (audioTrack) {
				if (!this.shouldOpenMicrophone()) {
					await audioTrack.mute();
				}

				this._prejoinTracks.update((tracks) => [...tracks, audioTrack]);
				this.log.d('New microphone track created and added:', deviceId);
			}
		} catch (error) {
			this.log.e('Failed to create new audio track:', error);
			const message = error instanceof Error ? error.message : 'Unknown error';
			throw new Error(`Failed to switch microphone: ${message}`, { cause: error });
		}
	}

	/**
	 * Creates local tracks for video and audio devices.
	 *
	 * Each kind is requested separately, so a device that is missing or held by another application
	 * does not prevent the other one from opening.
	 *
	 * @param videoDeviceId - The ID of the video device to use. If not provided, the default video device will be used.
	 * @param audioDeviceId - The ID of the audio device to use. If not provided, the default audio device will be used.
	 * @param applyStoredMuteState - Whether a created track is muted when the stored preference for
	 * its kind says "off". Pass false when the call itself is the user enabling that kind, so the
	 * device is not opened and immediately closed again.
	 * @returns A promise that resolves to an array of LocalTrack objects representing the created tracks.
	 */
	private async createLocalTracks(
		videoDeviceId: string | boolean | undefined = undefined,
		audioDeviceId: string | boolean | undefined = undefined,
		{ applyStoredMuteState = true }: { applyStoredMuteState?: boolean } = {}
	): Promise<LocalTrack[]> {
		// Default to the user's stored preference (availability-independent). Whether a device is
		// actually opened — and which one — is resolved by the per-kind logic below; on first visit
		// the device list is still empty, so a default-device request is issued to obtain permission.
		videoDeviceId ??= this.storageService.isCameraEnabled();
		audioDeviceId ??= this.storageService.isMicrophoneEnabled();

		const options: CreateLocalTracksOptions = {
			audio: { ...MICROPHONE_CAPTURE_DEFAULTS },
			video: { ...CAMERA_CAPTURE_DEFAULTS }
		};

		// Video device. An empty device list means either "permission not granted yet" — labels, and
		// therefore the list, only exist once it is — or "no camera at all", and the two are not
		// distinguishable from here. Both are served by keeping the default-device request set
		// above: on a first visit it is what grants permission, and a missing camera simply fails
		// that one request, which createTracksWithFallback absorbs per kind.
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
			newLocalTracks = await this.createTracksWithFallback(options);

			const videoTrack = newLocalTracks.find((t) => t.kind === Track.Kind.Video) as LocalVideoTrack | undefined;

			if (videoTrack) {
				await this.videoTrackProcessorService.applyToVideoTrack(videoTrack);
			}

			if (!applyStoredMuteState) return newLocalTracks;

			// Mute tracks when the user's stored preference is "off". This is availability-independent
			// so a freshly created track isn't muted before devices have been enumerated.
			if (!this.storageService.isCameraEnabled()) {
				await newLocalTracks.find((t) => t.kind === Track.Kind.Video)?.mute();
			}

			if (!this.storageService.isMicrophoneEnabled()) {
				await newLocalTracks.find((t) => t.kind === Track.Kind.Audio)?.mute();
			}
		}

		return newLocalTracks;
	}

	/**
	 * Creates tracks with fallback strategy to handle device conflicts
	 * @param options - The track creation options
	 * @returns Array of successfully created tracks
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
}
