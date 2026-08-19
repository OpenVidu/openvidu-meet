import { Injector, Service, inject } from '@angular/core';
import { ParticipantModel } from '../../models/participant.model';
import { StreamLayoutStateService } from '../layout/stream-layout-state.service';
import type { AudioCaptureOptions, ScreenShareCaptureOptions, VideoCaptureOptions } from '../livekit';
import { VideoPresets } from '../livekit';
import { LocalMediaIntentService } from '../local-media-intent/local-media-intent.service';
import { LocalTrackService } from '../local-track/local-track.service';
import { MeetingLiveKitService } from '../meeting-livekit/meeting-livekit.service';
import { ParticipantService } from '../participant/participant.service';
import { MediaStorageService } from '../storage/storage.service';
import { LoggerService } from '../../../../../shared/services/logger.service';

/**
 * The single point where local media control resolves the prejoin-vs-room duality. Toggling and
 * switching the camera/microphone behaves differently before the Room exists (operate on the
 * temporary {@link LocalTrackService} tracks) versus after connecting (operate on the published
 * {@link ParticipantModel}). This branching used to be copy-pasted across 6 methods of
 * ParticipantService; it now lives in exactly one place — the {@link target} getter — behind a
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
 * underlying MediaStreamTrack, so every mutation bumps the model's revision — that is what re-drives
 * the reactive local-media state and, through it, the mic-activity monitor.
 */
class RoomTarget implements LocalMediaTarget {
	constructor(
		private readonly participant: ParticipantModel,
		private readonly storageSrv: MediaStorageService
	) {}

	async setCameraEnabled(enabled: boolean): Promise<void> {
		const storageDevice = this.storageSrv.getVideoDevice();
		let options: VideoCaptureOptions | undefined;

		if (storageDevice) {
			options = {
				deviceId: storageDevice.device,
				facingMode: 'user',
				resolution: VideoPresets.h720.resolution
			};
		}

		await this.participant.setCameraEnabled(enabled, options);
		this.participant.bump();
	}

	async setMicrophoneEnabled(enabled: boolean): Promise<void> {
		const storageDevice = this.storageSrv.getAudioDevice();
		let options: AudioCaptureOptions | undefined;

		if (storageDevice) {
			options = { deviceId: storageDevice.device };
		}

		await this.participant.setMicrophoneEnabled(enabled, options);
		this.participant.bump();
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
 * registry + connect(). Persistence of the camera/microphone preference lives here — a call to
 * setCameraEnabled/setMicrophoneEnabled always represents user/app intent.
 *
 * Screen share is room-only (no prejoin equivalent), so it is handled directly rather than through
 * the {@link LocalMediaTarget} Strategy.
 *
 * Write-only: to read whether a device is on, inject `LocalMediaStateService`.
 */
@Service()
export class LocalMediaControlService {
	private readonly injector = inject(Injector);
	private readonly meetingLiveKitService = inject(MeetingLiveKitService);
	private readonly localTrackService = inject(LocalTrackService);
	private readonly storageSrv = inject(MediaStorageService);
	private readonly streamLayoutService = inject(StreamLayoutStateService);
	private readonly mediaIntent = inject(LocalMediaIntentService);
	private readonly log = inject(LoggerService).get('LocalMediaControlService');

	/** Resolved lazily to avoid a construction-time DI cycle with the participant registry. */
	private get participantService(): ParticipantService {
		return this.injector.get(ParticipantService);
	}

	/**
	 * The single prejoin-vs-room branching point. A RoomTarget is used only when the Room is
	 * connected AND the local participant exists; otherwise the prejoin tracks are the target.
	 */
	private get target(): LocalMediaTarget {
		const local = this.participantService.localParticipant();
		return this.meetingLiveKitService.isConnected() && local
			? new RoomTarget(local, this.storageSrv)
			: new PrejoinTarget(this.localTrackService);
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
