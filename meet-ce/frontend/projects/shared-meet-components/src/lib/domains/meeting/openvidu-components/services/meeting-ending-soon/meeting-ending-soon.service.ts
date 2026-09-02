import { Service, signal } from '@angular/core';

/**
 * Live countdown to a duration-limited meeting's forced end, seeded once from the
 * `MEET_MEETING_ENDING_SOON` signal (see `MeetingEventHandlerService.handleMeetingEndingSoon`).
 * Ticks locally against `Date.now()`, so it needs no further signals from the server to stay
 * accurate.
 *
 * The real end is still driven by the backend's own sweep, up to about a minute after this reaches
 * zero: `remainingMs` clamps at 0 instead of going negative, since the meeting really is about to
 * end and the actual `meetingEnded`/room-closed flow takes over from there.
 */
@Service()
export class MeetingEndingSoonService {
	private tickHandle: ReturnType<typeof setInterval> | undefined;
	private endsAt: number | undefined;

	readonly remainingMs = signal<number | undefined>(undefined);

	/**
	 * Starts the countdown, ending `remainingMs` milliseconds from now.
	 */
	start(remainingMs: number): void {
		this.endsAt = Date.now() + remainingMs;
		this.clearTick();
		this.tick();
		this.tickHandle = setInterval(() => this.tick(), 1000);
	}

	private tick(): void {
		if (this.endsAt === undefined) return;

		const remaining = Math.max(0, this.endsAt - Date.now());
		this.remainingMs.set(remaining);

		if (remaining === 0) {
			this.clearTick();
		}
	}

	private clearTick(): void {
		if (this.tickHandle) {
			clearInterval(this.tickHandle);
			this.tickHandle = undefined;
		}
	}
}
