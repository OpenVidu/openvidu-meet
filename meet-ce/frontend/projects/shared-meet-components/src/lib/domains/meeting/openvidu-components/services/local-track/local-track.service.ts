import { inject, Injectable, Signal } from '@angular/core';
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
import { MeetingConnectionService } from '../meeting-connection/meeting-connection.service';
import { StorageService } from '../storage/storage.service';
import { VideoTrackProcessorService } from '../track-processor/video-track-processor.service';
import { LoggerService } from '../../../../../shared/services/logger.service';
import type { ILogger } from '../../../../../shared/models/logger.model';

/**
 * Owns the local participant's media capture: creating/switching camera & microphone tracks
 * (prejoin and in-call) and their enabled state. The room connection itself lives separately
 * in MeetingConnectionService.
 */
@Injectable({
	providedIn: 'root'
})
export class LocalTrackService {
	private readonly deviceService = inject(DeviceService);
	private readonly storageService = inject(StorageService);
	private readonly livekitSdkService = inject(LivekitSdkService);
	private readonly videoTrackProcessorService = inject(VideoTrackProcessorService);
	private readonly meetingConnectionService = inject(MeetingConnectionService);

	/*
	 * Tracks used in the prejoin component. They are created when the room is not yet created.
	 */
	private localTracks: LocalTrack[] = [];
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
		this.localTracks = tracks.filter((track) => track !== undefined) as LocalTrack[];
	}

	/**
	 * @internal
	 * @returns
	 */
	getLocalTracks(): LocalTrack[] {
		return this.localTracks;
	}

	/**
	 * @internal
	 **/
	removeLocalTracks(): void {
		this.localTracks.forEach((track) => {
			track.stop();
			track.detach();
		});
		this.localTracks = [];
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
		allowPartialCreation: boolean = true
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
			if (this.deviceService.hasVideoDeviceAvailable()) {
				const selectedCamera = this.deviceService.getCameraSelected();
				options.video = { deviceId: this.toDeviceConstraint(selectedCamera?.device) } as VideoCaptureOptions;
			} else if (!this.deviceService.hasVideoPermissionGranted()) {
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
			if (this.deviceService.hasAudioDeviceAvailable()) {
				const selectedMic = this.deviceService.getMicrophoneSelected();
				(options.audio as AudioCaptureOptions).deviceId = this.toDeviceConstraint(selectedMic?.device);
			} else if (!this.deviceService.hasAudioPermissionGranted()) {
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
		let videoTrack = this.localTracks?.find((track) => track.kind === Track.Kind.Video);
		// Room is not connected, so we can't enable/disable the camera
		if (enabled) {
			await videoTrack?.unmute();
		} else {
			await videoTrack?.mute();
		}
	}

	/**
	 * @internal
	 * As the Room is not created yet, we need to handle the media tracks with a temporary array of tracks.
	 * This method must be only called from the prejoin component.
	 **/
	async setAudioTrackEnabled(enabled: boolean) {
		const audioTrack = this.localTracks?.find((track) => track.kind === Track.Kind.Audio);
		// Session is not connected, so we can't enable/disable the camera
		if (enabled) {
			await audioTrack?.unmute();
		} else {
			await audioTrack?.mute();
		}
	}

	/**
	 * @internal
	 * As the Room is not created yet, we need to handle the media tracks with a temporary array of tracks.
	 * This method must be only called before connect to room.
	 **/
	isVideoTrackEnabled(): boolean {
		if (this.localTracks.length === 0) {
			return this.deviceService.isCameraEnabled();
		}
		const videoTrack = this.localTracks.find((track) => track.kind === Track.Kind.Video);
		return !!videoTrack && !videoTrack.isMuted && videoTrack?.mediaStreamTrack?.enabled;
	}

	/**
	 * @internal
	 * As the Room is not created yet, we need to handle the media tracks with a temporary array of tracks.
	 * This method must be only called before connect to room.
	 **/
	isAudioTrackEnabled(): boolean {
		if (this.localTracks.length === 0) {
			return this.deviceService.isMicrophoneEnabled();
		}
		const audioTrack = this.localTracks.find((track) => track.kind === Track.Kind.Audio);
		return !!audioTrack && !audioTrack.isMuted && audioTrack?.mediaStreamTrack?.enabled;
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
		const existingTrack = this.localTracks.find((t) => t.kind === Track.Kind.Video) as
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
				this.localTracks.push(videoTrack);
				this.log.d('New camera track created and added:', deviceId);
			}
		} catch (error) {
			this.log.e('Failed to create new video track:', error);
			const message = error instanceof Error ? error.message : 'Unknown error';
			throw new Error(`Failed to switch camera: ${message}`);
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
		const existingTrack = this.localTracks.find((t) => t.kind === Track.Kind.Audio) as
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
				this.localTracks.push(audioTrack);
				this.log.d('New microphone track created and added:', deviceId);
			}
		} catch (error) {
			this.log.e('Failed to create new audio track:', error);
			const message = error instanceof Error ? error.message : 'Unknown error';
			throw new Error(`Failed to switch microphone: ${message}`);
		}
	}

	/**
	 * Gets the current video track from local tracks or room.
	 * @returns LocalVideoTrack or undefined
	 * @internal
	 */
	async getCurrentVideoTrack(): Promise<LocalVideoTrack | undefined> {
		// First try to get from local tracks (prejoin state)
		let videoTrack = this.localTracks.find((t) => t.kind === Track.Kind.Video) as LocalVideoTrack | undefined;

		// If not found and room is connected, get from published tracks
		if (!videoTrack && this.meetingConnectionService.isConnected()) {
			const localParticipant = this.meetingConnectionService.getRoom().localParticipant;
			const videoPublication = localParticipant
				.getTrackPublications()
				.find((pub) => pub.kind === Track.Kind.Video);
			videoTrack = videoPublication?.track as LocalVideoTrack | undefined;
		}

		return videoTrack;
	}
}
