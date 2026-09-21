import { computed, inject, Service, Signal } from '@angular/core';
import { StreamLayoutStateService } from '../layout/stream-layout-state.service';
import type { ScreenShareCaptureOptions } from '../livekit';
import { VideoPresets } from '../livekit';
import { ParticipantService } from '../participant/participant.service';
import { LoggerService } from '../../../../../shared/services/logger.service';

/**
 * The local participant's screen share. Meeting only: there is no share before joining, so it is
 * published straight through the participant, and pinning it is a layout decision taken here.
 */
@Service()
export class ScreenShareService {
	private readonly participantService = inject(ParticipantService);
	private readonly streamLayoutService = inject(StreamLayoutStateService);
	private readonly log = inject(LoggerService).get('ScreenShareService');

	/** Whether the local participant is sharing their screen. */
	readonly enabled: Signal<boolean> = computed(
		() => this.participantService.localParticipant()?.isScreenShareEnabled ?? false
	);

	/**
	 * Share or unshare the local participant screen.
	 * @param enabled: true to share the screen, false to unshare it
	 */
	async setEnabled(enabled: boolean): Promise<void> {
		const localParticipant = this.participantService.localParticipant();
		const options = this.captureOptions();
		const track = await localParticipant?.setScreenShareEnabled(enabled, options);

		if (enabled && track) {
			// Set all videos to normal size when a local screen is shared
			this.streamLayoutService.unpinAllStreams();
			this.streamLayoutService.toggleStreamPinned(track.trackSid);
			this.streamLayoutService.recordScreenSharePublication(track.trackSid, new Date().getTime());

			track?.addListener('ended', async () => {
				this.log.d('Clicked native stop button. Stopping screen sharing');
				await this.setEnabled(false);
			});
		} else if (!enabled && track) {
			// Enlarge the last screen shared when a local screen is stopped
			this.streamLayoutService.clearScreenSharePublication(track.trackSid);
			this.streamLayoutService.unpinAllStreams();
			this.streamLayoutService.setLastScreenPinned();
		}

		localParticipant?.bump();
	}

	/**
	 * Switches the active screen share track showing a native browser dialog to select a screen or window.
	 */
	async switch(): Promise<void> {
		const localParticipant = this.participantService.localParticipant();

		if (!localParticipant) {
			this.log.e('Local participant is undefined when switching screenshare');
			return;
		}

		// Chrome / Safari: seamless replaceTrack keeps the same publication SID.
		const options = this.captureOptions();
		const [newTrack] = await localParticipant.createScreenTracks(options);

		if (newTrack) {
			newTrack.addListener('ended', async () => {
				this.log.d('Clicked native stop button. Stopping screen sharing');
				await this.setEnabled(false);
			});

			try {
				await localParticipant.switchScreenshare(newTrack);
			} catch (error) {
				newTrack.stop();
				throw error;
			}
		}
	}

	private captureOptions(): ScreenShareCaptureOptions {
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
