import { inject, Service } from '@angular/core';
import { acquireDevice, switchDevice } from '../../models/device-acquisition.model';
import { isCapturing, LocalDevice } from '../../models/local-device.model';
import { cameraCaptureOptions, microphoneCaptureOptions } from '../../models/media-capture.model';
import type { ParticipantModel } from '../../models/participant.model';
import { DeviceService } from '../device/device.service';
import type { CreateLocalTracksOptions, LocalAudioTrack, LocalTrack, LocalVideoTrack } from '../livekit';
import { MediaDeviceFailure, Track } from '../livekit';
import { LivekitSdkService } from '../livekit/livekit-sdk.service';
import { VideoTrackProcessorService } from '../track-processor/video-track-processor.service';
import { LoggerService } from '../../../../../shared/services/logger.service';
import { NotificationService } from '../../../../../shared/services/notification.service';

/**
 * Which local devices are meant to be open on entry. Resolved once per entry outside this library
 * and pushed in.
 */
export interface InitialMediaState {
	camera: boolean;
	microphone: boolean;
}

/** Long enough to read which device failed and why, short enough not to sit on top of the meeting. */
const NOTICE_DURATION_MS = 10_000;

/**
 * Owns the local participant's camera and microphone for the whole entry: opens them for the
 * prejoin, publishes them when the participant joins and keeps operating on the very same tracks
 * until it releases them. The Room is where the tracks are published, not where their state lives,
 * so nothing here depends on whether the participant has joined yet.
 */
@Service()
export class LocalMediaService {
	private readonly deviceService = inject(DeviceService);
	private readonly livekitSdkService = inject(LivekitSdkService);
	private readonly videoTrackProcessorService = inject(VideoTrackProcessorService);
	private readonly notificationService = inject(NotificationService);
	private readonly log = inject(LoggerService).get('LocalMediaService');

	readonly camera = new LocalDevice<LocalVideoTrack>(Track.Kind.Video, this.deviceService.hasVideoDevices);
	readonly microphone = new LocalDevice<LocalAudioTrack>(Track.Kind.Audio, this.deviceService.hasAudioDevices);

	private participant: ParticipantModel | undefined;
	private acquired = false;
	private entry = 0;
	private lastInitialState: Partial<InitialMediaState> = {};
	private queue: Promise<unknown> = Promise.resolve();

	/**
	 * Takes the initial state resolved outside the library. It arrives through a reactive input that
	 * re-emits on every recomputation, so per device only a changed value is applied: an unchanged
	 * one must not undo a toggle made in the meantime.
	 */
	applyInitialState({ camera, microphone }: InitialMediaState): void {
		if (this.lastInitialState.camera !== camera) {
			this.lastInitialState.camera = camera;
			this.camera.setWanted(camera);
		}

		if (this.lastInitialState.microphone !== microphone) {
			this.lastInitialState.microphone = microphone;
			this.microphone.setWanted(microphone);
		}
	}

	/** Opens the wanted devices, once per entry: calling it again before {@link release} does nothing. */
	acquire(): Promise<void> {
		return this.run(async () => {
			if (this.acquired) return;

			const entry = this.entry;
			await this.open(this.camera.wanted(), this.microphone.wanted(), entry);

			if (entry !== this.entry) return;

			this.acquired = true;
			this.camera.markAcquired();
			this.microphone.markAcquired();
		});
	}

	/** Publishes the open devices to the participant, along with any device opened from now on. */
	publish(participant: ParticipantModel): Promise<void> {
		return this.run(async () => {
			this.participant = participant;
			await this.publishTracks(this.openTracks());
		});
	}

	setCameraEnabled(enabled: boolean): Promise<void> {
		return this.setEnabled(this.camera, enabled);
	}

	setMicrophoneEnabled(enabled: boolean): Promise<void> {
		return this.setEnabled(this.microphone, enabled);
	}

	switchCamera(deviceId: string): Promise<void> {
		return this.switchTo(this.camera, deviceId);
	}

	switchMicrophone(deviceId: string): Promise<void> {
		return this.switchTo(this.microphone, deviceId);
	}

	/** Stops and forgets both devices and the participant they were published to. The next entry starts over. */
	release(): void {
		this.entry++;
		this.camera.release();
		this.microphone.release();
		this.participant = undefined;
		this.acquired = false;
		this.lastInitialState = {};
	}

	/**
	 * The intent is recorded before acting: the status effect that tells an embedded host about a
	 * change reads it when the state moves. An intent the device could not fulfil is taken back.
	 */
	private setEnabled(device: LocalDevice, enabled: boolean): Promise<void> {
		const previous = device.wanted();
		device.setWanted(enabled);

		return this.run(async () => {
			try {
				await this.apply(device, enabled);
			} catch (error) {
				device.setWanted(previous);

				if (enabled) this.reportUnavailable(device.kind);

				throw error;
			}
		});
	}

	private async apply(device: LocalDevice, enabled: boolean): Promise<void> {
		const track = device.track();

		if (!enabled) {
			await track?.mute();
			return;
		}

		if (!track) {
			await this.openOne(device);
			return;
		}

		if (isCapturing(track)) return;

		// unmute() reacquires a camera whose capture mute() stopped; a capture that ended on its own,
		// as when the device is unplugged, is not muted and has to be restarted explicitly.
		await acquireDevice<unknown>(() => (track.isMuted ? track.unmute() : track.restartTrack()), this.log);
	}

	private switchTo(device: LocalDevice, deviceId: string): Promise<void> {
		return this.run(async () => {
			const track = device.track();

			// A closed device opens on the selected one when it is turned on.
			if (!track) return;

			const currentDeviceId = track.mediaStreamTrack.getSettings().deviceId;

			try {
				await switchDevice((id) => this.restart(track, id), deviceId, currentDeviceId, this.log);
			} catch (error) {
				this.reportUnavailable(device.kind);
				throw error;
			} finally {
				// restartTrack reopens the device whatever the mute state; a device that is off stays closed.
				if (track.isMuted) track.mediaStreamTrack.stop();
			}
		});
	}

	private restart(track: LocalTrack, deviceId: string): Promise<void> {
		return track.kind === Track.Kind.Video
			? (track as LocalVideoTrack).restartTrack(cameraCaptureOptions(deviceId))
			: (track as LocalAudioTrack).restartTrack(microphoneCaptureOptions(deviceId));
	}

	/** Opens the given kinds, keeping whatever the browser handed over: the prejoin says what did not open. */
	private async open(video: boolean, audio: boolean, entry: number): Promise<void> {
		const options = this.captureOptions(video, audio);

		if (!options.video && !options.audio) return;

		this.log.d('Opening the local devices', options);
		const tracks = await this.request(options);
		await this.adopt(tracks, requestedKinds(options), entry);
	}

	/** Opens one device for a toggle, which has to hear about a device that did not open. */
	private async openOne(device: LocalDevice): Promise<void> {
		const isCamera = device.kind === Track.Kind.Video;
		const options = this.captureOptions(isCamera, !isCamera);
		const entry = this.entry;
		let tracks: LocalTrack[];

		try {
			tracks = await this.createTracks(options);
		} catch (error) {
			await this.deviceService.syncDevicesAfterAcquisition([device.kind], []);
			throw error;
		}

		await this.adopt(tracks, [device.kind], entry);
	}

	private captureOptions(video: boolean, audio: boolean): CreateLocalTracksOptions {
		return {
			video: video && cameraCaptureOptions(this.deviceService.cameraSelected()?.device),
			audio: audio && microphoneCaptureOptions(this.deviceService.microphoneSelected()?.device)
		};
	}

	/**
	 * Takes freshly opened tracks in: the device catalog learns what was opened, the camera gets its
	 * background processor back and the participant, once joined, publishes them. Tracks that the
	 * browser handed over after the entry was released are closed again.
	 */
	private async adopt(tracks: LocalTrack[], kinds: Track.Kind[], entry: number): Promise<void> {
		if (entry !== this.entry) {
			tracks.forEach((track) => track.stop());
			return;
		}

		await this.deviceService.syncDevicesAfterAcquisition(kinds, tracks);

		for (const track of tracks) {
			if (track.kind === Track.Kind.Video) {
				await this.videoTrackProcessorService.applyToVideoTrack(track as LocalVideoTrack);
				this.camera.attach(track as LocalVideoTrack);
			} else {
				this.microphone.attach(track as LocalAudioTrack);
			}
		}

		await this.publishTracks(tracks);
	}

	private async publishTracks(tracks: LocalTrack[]): Promise<void> {
		const participant = this.participant;

		if (!participant || tracks.length === 0) return;

		await Promise.all(tracks.map((track) => participant.publishTrack(track)));
		participant.bump();
	}

	private openTracks(): LocalTrack[] {
		const tracks: Array<LocalTrack | undefined> = [this.camera.track(), this.microphone.track()];
		return tracks.filter((track): track is LocalTrack => !!track);
	}

	/**
	 * Asks for every wanted device in one `getUserMedia`, which costs a single browser permission
	 * prompt. That request is all-or-nothing, so a camera held by another application would take the
	 * microphone down with it: only then is each device asked for on its own. A denied permission is
	 * never retried: the prompt would come back asking for an answer already given.
	 */
	private async request(options: CreateLocalTracksOptions): Promise<LocalTrack[]> {
		try {
			return await this.createTracks(options);
		} catch (error) {
			const denied = MediaDeviceFailure.getFailure(error) === MediaDeviceFailure.PermissionDenied;

			if (denied || !options.audio || !options.video) {
				this.log.w('Failed to open the local devices:', error);
				return [];
			}

			this.log.w('Failed to open both devices at once, asking device by device:', error);

			return this.requestDeviceByDevice(options);
		}
	}

	private async requestDeviceByDevice(options: CreateLocalTracksOptions): Promise<LocalTrack[]> {
		const tracks: LocalTrack[] = [];

		for (const deviceOptions of [{ video: options.video }, { audio: options.audio }]) {
			try {
				tracks.push(...(await this.createTracks(deviceOptions)));
			} catch (error) {
				this.log.w('Failed to open a local device, it may be busy:', error);
			}
		}

		return tracks;
	}

	private createTracks(options: CreateLocalTracksOptions): Promise<LocalTrack[]> {
		return acquireDevice(() => this.livekitSdkService.createLocalTracks(options), this.log);
	}

	/** Device operations run one at a time: a toggle issued while the devices are still opening applies once they are. */
	private run<T>(operation: () => Promise<T>): Promise<T> {
		const result = this.queue.then(operation, operation);
		this.queue = result.then(
			() => undefined,
			() => undefined
		);

		return result;
	}

	private reportUnavailable(kind: Track.Kind): void {
		const camera = kind === Track.Kind.Video;

		this.notificationService.showNotification({
			kind: 'device-unavailable',
			icon: camera ? 'videocam_off' : 'mic_off',
			tone: 'alert',
			message: { key: camera ? 'ERRORS.CAMERA_UNAVAILABLE' : 'ERRORS.MICROPHONE_UNAVAILABLE' },
			durationMs: NOTICE_DURATION_MS
		});
	}
}

const requestedKinds = (options: CreateLocalTracksOptions): Track.Kind[] => {
	const kinds: Track.Kind[] = [];

	if (options.video) kinds.push(Track.Kind.Video);

	if (options.audio) kinds.push(Track.Kind.Audio);

	return kinds;
};
