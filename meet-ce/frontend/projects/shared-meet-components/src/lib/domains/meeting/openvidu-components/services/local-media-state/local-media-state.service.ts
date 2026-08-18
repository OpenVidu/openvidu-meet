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
 * Reactive state of the local participant's microphone/camera/screen share across both phases of the
 * app: which track is in effect, and whether the device is on. No mutation logic — it only *reads*
 * from the two underlying sources of truth and exposes a single signal per question:
 *
 * - Prejoin (room not yet connected): {@link LocalTrackService}'s signals.
 * - Meeting (connected): the {@link ParticipantModel}, kept reactive through its `_revision`/`bump()`
 * mechanism.
 *
 * When the participant connects, `localParticipant()` becomes defined and the model takes over;
 * once the prejoin reference is released (see `LocalTrackService.clearLocalTracksReference`) the
 * two never disagree.
 *
 * **This is the single source of truth for "is my camera/microphone on?"** — the question used to
 * have one answer per consumer (a component-local signal seeded once, a Strategy that also folded in
 * the embedding app's config, the stored preference…), which is how a host command could mute the
 * device without the prejoin button noticing. Read these signals; never mirror them into a local one.
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

	/** Whether the local microphone is on right now (prejoin or meeting). */
	readonly microphoneEnabled: Signal<boolean> = computed(() => {
		const local = this.participantService.localParticipant();
		return local ? local.isMicrophoneEnabled : this.localTrackService.microphoneEnabled();
	});

	/** Whether the local camera is on right now (prejoin or meeting). */
	readonly cameraEnabled: Signal<boolean> = computed(() => {
		const local = this.participantService.localParticipant();
		return local ? local.isCameraEnabled : this.localTrackService.cameraEnabled();
	});

	/** Whether the local participant is sharing their screen. Room-only: there is no prejoin sharing. */
	readonly screenShareEnabled: Signal<boolean> = computed(
		() => this.participantService.localParticipant()?.isScreenShareEnabled ?? false
	);
}
