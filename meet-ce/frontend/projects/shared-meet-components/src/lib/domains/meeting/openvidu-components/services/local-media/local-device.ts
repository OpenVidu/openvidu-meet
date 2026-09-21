import { computed, Signal, signal } from '@angular/core';
import type { LocalTrack } from '../livekit';
import { Track, TrackEvent } from '../livekit';

/** Whether the track is delivering media right now: not muted, and its capture still running. */
export const isCapturing = (track: LocalTrack): boolean =>
	!track.isMuted && track.mediaStreamTrack.readyState === 'live';

/**
 * The local participant's device of one kind, from the prejoin to the end of the meeting. The track
 * is the same object before and after it is published, so this is the one place both phases read
 * from; it follows the track's own events, which is also how a mute asked by a moderator lands.
 */
export class LocalDevice<T extends LocalTrack = LocalTrack> {
	private readonly _wanted = signal(true);
	private readonly _track = signal<T | undefined>(undefined);
	private readonly _mediaStreamTrack = signal<MediaStreamTrack | undefined>(undefined);
	private readonly _capturing = signal(false);
	private readonly _acquired = signal(false);
	private unfollow: (() => void) | undefined;

	/** Whether the participant, or the host, wants the device on. */
	readonly wanted = this._wanted.asReadonly();
	/** The track capturing the device, or undefined while it is not open. */
	readonly track = this._track.asReadonly();
	/** The capture behind the track. A device switch swaps it inside the same track, which is why it has a signal of its own. */
	readonly mediaStreamTrack = this._mediaStreamTrack.asReadonly();
	/**
	 * Whether the device is on. Until the first acquisition it is predicted from what is wanted and
	 * available; afterwards the track is the truth, so a device that could not be opened reads off.
	 */
	readonly enabled: Signal<boolean> = computed(() =>
		this._acquired() ? this._capturing() : this._wanted() && this.available()
	);

	constructor(
		readonly kind: Track.Kind,
		private readonly available: Signal<boolean>
	) {}

	setWanted(wanted: boolean): void {
		this._wanted.set(wanted);
	}

	/** Records that an acquisition ran, whether or not it opened this device. */
	markAcquired(): void {
		this._acquired.set(true);
	}

	attach(track: T): void {
		this.forget();

		const follow = () => {
			this._capturing.set(isCapturing(track));
			this._mediaStreamTrack.set(track.mediaStreamTrack);
		};

		track.on(TrackEvent.Muted, follow);
		track.on(TrackEvent.Unmuted, follow);
		track.on(TrackEvent.Restarted, follow);
		track.on(TrackEvent.Ended, follow);

		this.unfollow = () => {
			track.off(TrackEvent.Muted, follow);
			track.off(TrackEvent.Unmuted, follow);
			track.off(TrackEvent.Restarted, follow);
			track.off(TrackEvent.Ended, follow);
		};

		this._track.set(track);
		follow();
	}

	/** Stops the capture and forgets the track; the device is back to what a new entry starts with. */
	release(): void {
		const track = this._track();
		track?.stop();
		track?.detach();
		this.forget();
		this._acquired.set(false);
		this._wanted.set(true);
	}

	private forget(): void {
		this.unfollow?.();
		this.unfollow = undefined;
		this._track.set(undefined);
		this._mediaStreamTrack.set(undefined);
		this._capturing.set(false);
	}
}
