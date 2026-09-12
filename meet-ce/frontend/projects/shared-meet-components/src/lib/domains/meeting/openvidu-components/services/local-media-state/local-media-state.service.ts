import { computed, inject, Service, Signal } from '@angular/core';
import type { LocalVideoTrack } from '../livekit';
import { LocalTrackService } from '../local-track/local-track.service';
import { ParticipantService } from '../participant/participant.service';

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

	/**
	 * The camera track in effect right now (prejoin or meeting), or undefined — including while a
	 * dropped connection is being resumed, when the Room does not report `Connected` but the
	 * participant still holds its publications.
	 */
	readonly cameraTrack: Signal<LocalVideoTrack | undefined> = computed(() => {
		const local = this.participantService.localParticipant();

		// Connected: read the published track (reactive via the model's _revision).
		if (local) return local.getCameraTrack();

		// Prejoin: read the temporary local track signal.
		return this.localTrackService.cameraTrack();
	});

	/**
	 * The MediaStreamTrack the microphone is capturing right now (prejoin or meeting), or undefined.
	 *
	 * Consumers that own something derived from the raw capture — MicActivityService clones it to
	 * power the "speaking while muted" warning — must depend on this and not on a signal of track
	 * objects: a device switch swaps the MediaStreamTrack in place, keeping the same
	 * LocalAudioTrack object, so a signal of tracks holds the same value across the switch and cannot
	 * notify. Muting does not swap the capture track (the room publishes with
	 * `stopMicTrackOnMute: false`), so a mute/unmute leaves this signal — and the monitor — untouched.
	 */
	readonly microphoneMediaStreamTrack: Signal<MediaStreamTrack | undefined> = computed(() => {
		const local = this.participantService.localParticipant();

		if (local) return local.getMicrophoneTrack()?.mediaStreamTrack;

		return this.localTrackService.microphoneMediaStreamTrack();
	});

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
