import { Service, inject } from '@angular/core';
import { cameraCaptureOptions, microphoneCaptureOptions } from '../../models/media-capture.model';
import { ParticipantModel } from '../../models/participant.model';
import { DeviceService } from '../device/device.service';
import { StreamLayoutStateService } from '../layout/stream-layout-state.service';
import type { ScreenShareCaptureOptions } from '../livekit';
import { Track, VideoPresets } from '../livekit';
import { LocalMediaIntentService } from '../local-media-intent/local-media-intent.service';
import { LocalTrackService } from '../local-track/local-track.service';
import { ParticipantService } from '../participant/participant.service';
import { LoggerService } from '../../../../../shared/services/logger.service';

/**
 * The single point where local media control resolves the prejoin-vs-room duality. Toggling and
 * switching the camera/microphone behaves differently before the Room exists (operate on the
 * temporary {@link LocalTrackService} tracks) versus after connecting (operate on the published
 * {@link ParticipantModel}). This branching used to be copy-pasted across 6 methods of
 * ParticipantService; it now lives in exactly one place, the {@link target} getter, behind a
 * minimal {@link LocalMediaTarget} Strategy.
 *
 * Only the *write* side branches. Reading whether a device is on is the same question in both phases
 * and belongs to `LocalMediaStateService`, which answers it as a signal.
 */
interface LocalMediaTarget {
	setCameraEnabled(enabled: boolean): Promise<void>;
	setMicrophoneEnabled(enabled: boolean): Promise<void>;
	switchCamera(deviceId: string): Promise<void>;
	switchMicrophone(deviceId: string): Promise<void>;
}

/**
 * Connected phase: operate on the published participant. A device switch or enable re-acquires the
 * underlying MediaStreamTrack, so every mutation bumps the model's revision: that is what re-drives
 * the reactive local-media state and, through it, the mic-activity monitor.
 *
 * Enabling a device opens the one selected in {@link DeviceService}, exactly as the prejoin does.
 * It is also what asks for media permission, so the attempt is reported to {@link DeviceService}
 * whatever its outcome; the prejoin tracks report their own acquisitions.
 */
class RoomTarget implements LocalMediaTarget {
	constructor(
		private readonly participant: ParticipantModel,
		private readonly deviceService: DeviceService
	) {}

	async setCameraEnabled(enabled: boolean): Promise<void> {
		const options = cameraCaptureOptions(this.deviceService.cameraSelected()?.device);

		try {
			await this.participant.setCameraEnabled(enabled, options);
			this.participant.bump();
		} finally {
			if (enabled) await this.deviceService.syncDevicesAfterAcquisition([Track.Kind.Video]);
		}
	}

	async setMicrophoneEnabled(enabled: boolean): Promise<void> {
		const options = microphoneCaptureOptions(this.deviceService.microphoneSelected()?.device);

		try {
			await this.participant.setMicrophoneEnabled(enabled, options);
			this.participant.bump();
		} finally {
			if (enabled) await this.deviceService.syncDevicesAfterAcquisition([Track.Kind.Audio]);
		}
	}

	async switchCamera(deviceId: string): Promise<void> {
		await this.participant.switchCamera(deviceId);
		this.participant.bump();
	}

	async switchMicrophone(deviceId: string): Promise<void> {
		await this.participant.switchMicrophone(deviceId);
		this.participant.bump();
	}
}

/**
 * Prejoin phase (Room not yet connected): operate on the temporary local tracks.
 */
class PrejoinTarget implements LocalMediaTarget {
	constructor(private readonly localTrackService: LocalTrackService) {}

	async setCameraEnabled(enabled: boolean): Promise<void> {
		await this.localTrackService.setVideoTrackEnabled(enabled);
	}

	async setMicrophoneEnabled(enabled: boolean): Promise<void> {
		await this.localTrackService.setAudioTrackEnabled(enabled);
	}

	async switchCamera(deviceId: string): Promise<void> {
		await this.localTrackService.switchCamera(deviceId);
	}

	async switchMicrophone(deviceId: string): Promise<void> {
		await this.localTrackService.switchMicrophone(deviceId);
	}
}

/**
 * Facade for local media control: the toggles/switches for camera, microphone and
 * screen share. Extracted from ParticipantService so that service can shrink to the participant
 * registry + connect(). A call to setCameraEnabled/setMicrophoneEnabled always represents user/app
 * intent, which is recorded here.
 *
 * Screen share is room-only (no prejoin equivalent), so it is handled directly rather than through
 * the {@link LocalMediaTarget} Strategy.
 *
 * Write-only: to read whether a device is on, inject `LocalMediaStateService`.
 */
@Service()
export class LocalMediaControlService {
	private readonly localTrackService = inject(LocalTrackService);
	private readonly participantService = inject(ParticipantService);
	private readonly deviceService = inject(DeviceService);
	private readonly streamLayoutService = inject(StreamLayoutStateService);
	private readonly mediaIntent = inject(LocalMediaIntentService);
	private readonly log = inject(LoggerService).get('LocalMediaControlService');

	/**
	 * Prejoin-vs-room branching point: the published participant once it exists, the prejoin tracks
	 * before. Keyed on the same signal {@link LocalMediaStateService} reads the state from, so the
	 * write and read sides never disagree.
	 */
	private get target(): LocalMediaTarget {
		const local = this.participantService.localParticipant();
		return local ? new RoomTarget(local, this.deviceService) : new PrejoinTarget(this.localTrackService);
	}

	/**
	 * Sets the local participant camera enabled or disabled.
	 */
	async setCameraEnabled(enabled: boolean): Promise<void> {
		// Single writer of the camera intent. Recorded BEFORE acting, because opening a camera that was
		// never acquired reads the intent to decide whether the fresh track starts muted.
		this.mediaIntent.setCameraEnabled(enabled);
		await this.target.setCameraEnabled(enabled);
	}

	/**
	 * Sets the local participant microphone enabled or disabled.
	 */
	async setMicrophoneEnabled(enabled: boolean): Promise<void> {
		// Single writer of the microphone intent; recorded before acting, as above.
		this.mediaIntent.setMicrophoneEnabled(enabled);
		await this.target.setMicrophoneEnabled(enabled);
	}

	/**
	 * Switches the active camera track used in this room to the given device id.
	 */
	async switchCamera(deviceId: string): Promise<void> {
		await this.target.switchCamera(deviceId);
	}

	/**
	 * Switches the active microphone track used in this room to the given device id.
	 */
	async switchMicrophone(deviceId: string): Promise<void> {
		await this.target.switchMicrophone(deviceId);
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
}
