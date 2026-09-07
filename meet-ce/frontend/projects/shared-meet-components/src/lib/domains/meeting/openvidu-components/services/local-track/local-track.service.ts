import { computed, inject, Service, Signal, signal } from '@angular/core';
import { cameraCaptureOptions, microphoneCaptureOptions } from '../../models/media-capture.model';
import { CustomDevice } from '../../models/device.model';
import { DeviceService } from '../device/device.service';
import {
	CreateLocalTracksOptions,
	LocalAudioTrack,
	LocalTrack,
	LocalVideoTrack,
	MediaDeviceFailure,
	Track
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
	 * or update(); never push into the array in place, or the signal would not notify.
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
	 * something derived from the raw capture (MicActivityService clones it) must depend on this and
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
	 * array reference; see {@link setAudioTrackEnabled}.
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
	 * Creates the local camera and microphone tracks.
	 *
	 * Each kind takes a device id, `true` for the selected device (the browser's default when none
	 * is selected yet: on a first visit the device list is still unlabelled, and this very request is
	 * what grants the permission that labels it), or `false` to leave the device closed. Omitted, a
	 * kind follows the participant's intent.
	 * @internal
	 */
	async createLocalTracks(
		videoDevice: string | boolean = this.mediaIntent.cameraEnabled(),
		audioDevice: string | boolean = this.mediaIntent.microphoneEnabled()
	): Promise<LocalTrack[]> {
		const options: CreateLocalTracksOptions = {
			video:
				videoDevice !== false &&
				cameraCaptureOptions(this.deviceId(videoDevice, this.deviceService.cameraSelected())),
			audio:
				audioDevice !== false &&
				microphoneCaptureOptions(this.deviceId(audioDevice, this.deviceService.microphoneSelected()))
		};

		let newLocalTracks: LocalTrack[] = [];

		if (options.audio || options.video) {
			this.log.d('Creating local tracks with options', options);
			newLocalTracks = await this.requestTracks(options);

			await this.deviceService.syncDevicesAfterAcquisition(this.requestedKinds(options), newLocalTracks);

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

	private deviceId(device: string | true, selected: CustomDevice | undefined): string | undefined {
		return device === true ? selected?.device : device;
	}

	private requestedKinds(options: CreateLocalTracksOptions): Track.Kind[] {
		const kinds: Track.Kind[] = [];

		if (options.video) kinds.push(Track.Kind.Video);

		if (options.audio) kinds.push(Track.Kind.Audio);

		return kinds;
	}

	/**
	 * Asks for every wanted device in one `getUserMedia`, which costs a single browser permission
	 * prompt. That request is all-or-nothing, so a camera held by another application would take the
	 * microphone down with it: only then is each device asked for on its own. A denied permission is
	 * never retried: the prompt would come back asking for an answer already given.
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
	 * Turns the prejoin track of the given kind on or off. Enabling a device that was never opened
	 * (joined with `initial-video-active="false"`, or the stored preference was off, so
	 * `createLocalTracks()` skipped it) acquires it here.
	 *
	 * That acquisition used to live in the prejoin component's `onVideoEnabledChanged` handler, i.e.
	 * behind a UI click: an embedded host calling `mediaToggleVideo(true)` reached only the
	 * mute/unmute branch, found no track, and silently did nothing.
	 */
	private async setTrackEnabled(kind: Track.Kind, enabled: boolean): Promise<void> {
		const track = this._localTracks().find((t) => t.kind === kind);

		if (!enabled) {
			await track?.mute();
			this.notifyTracksMutated();
			return;
		}

		if (track) {
			await track.unmute();
			this.notifyTracksMutated();
			return;
		}

		await this.openTrack(kind);
	}

	/**
	 * Opens a device of the given kind (the selected one unless a device id is given) and adds it to
	 * the prejoin tracks. Whether the fresh track starts muted is decided by `createLocalTracks` from
	 * the intent, which is why the media-control facade records the intent before asking for the change.
	 */
	private async openTrack(kind: Track.Kind, deviceId: string | true = true): Promise<void> {
		const isAudio = kind === Track.Kind.Audio;
		const created = await this.createLocalTracks(isAudio ? false : deviceId, isAudio ? deviceId : false);
		const track = created.find((t) => t.kind === kind);

		if (!track) {
			this.log.w(`Could not open the ${isAudio ? 'microphone' : 'camera'}: no track was created`);
			return;
		}

		this._localTracks.update((tracks) => [...tracks, track]);
	}

	/**
	 * Whether a device of the given kind is meant to be open: what the participant asked for, and a
	 * device of that kind being available at all. Both halves are needed: an intent to open a
	 * camera that does not exist must not read as "camera on".
	 */
	private shouldBeOpen(kind: Track.Kind): boolean {
		return kind === Track.Kind.Audio
			? this.deviceService.hasAudioDevices() && this.mediaIntent.microphoneEnabled()
			: this.deviceService.hasVideoDevices() && this.mediaIntent.cameraEnabled();
	}

	/**
	 * Enabled state of the prejoin track of the given kind. With no tracks at all (still
	 * initializing, or the device was unavailable) it falls back to {@link shouldBeOpen}.
	 */
	private isTrackEnabled(kind: Track.Kind): boolean {
		const tracks = this._localTracks();

		if (!this.tracksAcquired && tracks.length === 0) {
			return this.shouldBeOpen(kind);
		}

		const track = tracks.find((t) => t.kind === kind);
		return !!track && !track.isMuted && !!track.mediaStreamTrack?.enabled;
	}

	/**
	 * Re-emits the track array. `mute()`/`unmute()`/`restartTrack()` mutate the track objects in
	 * place, which the array signal cannot see on its own.
	 */
	private notifyTracksMutated(): void {
		this._localTracks.update((tracks) => [...tracks]);
	}

	/**
	 * Switches the prejoin camera to the given device. See {@link switchDevice}.
	 * @internal
	 */
	async switchCamera(deviceId: string): Promise<void> {
		await this.switchDevice(Track.Kind.Video, deviceId);
	}

	/**
	 * Switches the prejoin microphone to the given device. See {@link switchDevice}.
	 * @internal
	 */
	async switchMicrophone(deviceId: string): Promise<void> {
		await this.switchDevice(Track.Kind.Audio, deviceId);
	}

	/**
	 * Restarts the existing track of the given kind onto another device. livekit-client swaps the
	 * MediaStreamTrack inside the same track object, so attached video elements follow, and a
	 * background processor is restarted onto the new capture. Without a track of that kind (the
	 * device was off, or could not be opened) the requested device is opened as a fresh track.
	 */
	private async switchDevice(kind: Track.Kind, deviceId: string): Promise<void> {
		const track = this._localTracks().find((t) => t.kind === kind);

		if (!track) {
			await this.openTrack(kind, deviceId);
			return;
		}

		try {
			await this.restartTrack(track, deviceId);

			if (!this.shouldBeOpen(kind)) {
				// mute() returns early on an already-muted track, which would leave the capture that
				// restartTrack just re-acquired open behind a UI that says off. Unmuting re-acquires it.
				await track.mute();
				track.mediaStreamTrack.stop();
			}

			this.notifyTracksMutated();
			this.log.d(`${kind} switched to device`, deviceId);
		} catch (error) {
			this.log.e(`Failed to switch the ${kind} device:`, error);
			throw error;
		}
	}

	/**
	 * restartTrack replaces the whole constraint set, so the capture profile has to be restated or the
	 * switched device would fall back to the browser's defaults.
	 */
	private restartTrack(track: LocalTrack, deviceId: string): Promise<void> {
		return track.kind === Track.Kind.Video
			? (track as LocalVideoTrack).restartTrack(cameraCaptureOptions(deviceId))
			: (track as LocalAudioTrack).restartTrack(microphoneCaptureOptions(deviceId));
	}
}
