import { computed, inject, Service, Signal } from '@angular/core';
import type { LocalAudioTrack, LocalVideoTrack } from '../livekit';
import { LocalTrackService } from '../local-track/local-track.service';
import { ParticipantService } from '../participant/participant.service';

/**
 * Signal equality keyed on the underlying MediaStreamTrack id: two track objects are "equal" when
 * they wrap the same MediaStreamTrack. This makes the state emit when the real capture track
 * changes (creation, device switch, re-acquisition after `stopMicTrackOnMute`) but stay quiet on a
 * mere enabled/mute toggle of the same track — avoiding needless churn in downstream consumers.
 */
function sameMediaStreamTrack(
	a: LocalAudioTrack | LocalVideoTrack | undefined,
	b: LocalAudioTrack | LocalVideoTrack | undefined
): boolean {
	return a?.mediaStreamTrack?.id === b?.mediaStreamTrack?.id;
}

/**
 * Reactive state of the local participant's current microphone/camera track across both
 * phases of the app. No mutation logic — it only *reads* from the two underlying sources of
 * truth and exposes a single signal per kind:
 *
 * - Prejoin (room not yet connected): {@link LocalTrackService}'s track signals.
 * - Meeting (connected): the {@link ParticipantModel}'s published tracks, kept reactive through
 * its `_revision`/`bump()` mechanism.
 *
 * When the participant connects, `localParticipant()` becomes defined and the model takes over;
 * once the prejoin reference is released (see `LocalTrackService.clearLocalTracksReference`) the
 * two never disagree. Consumers such as {@link MicActivityService} depend on these signals instead
 * of coordinating attach/detach calls at every media call-site.
 */
@Service()
export class LocalMediaStateService {
	private readonly localTrackService = inject(LocalTrackService);
	private readonly participantService = inject(ParticipantService);

	/** The microphone track in effect right now (prejoin or meeting), or undefined. */
	readonly microphoneTrack: Signal<LocalAudioTrack | undefined> = computed(
		() => {
			const local = this.participantService.localParticipant();
			// Connected: read the published track (reactive via the model's _revision).
			if (local) return local.getMicrophoneTrack();
			// Prejoin: read the temporary local track signal.
			return this.localTrackService.microphoneTrack();
		},
		{ equal: sameMediaStreamTrack }
	);

	/** The camera track in effect right now (prejoin or meeting), or undefined. */
	readonly cameraTrack: Signal<LocalVideoTrack | undefined> = computed(
		() => {
			const local = this.participantService.localParticipant();
			if (local) return local.getCameraTrack();
			return this.localTrackService.cameraTrack();
		},
		{ equal: sameMediaStreamTrack }
	);
}
