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
	private static readonly NOTICE_TIMEOUT_MS = 12_000;

	private tickHandle: ReturnType<typeof setInterval> | undefined;
	private noticeHandle: ReturnType<typeof setTimeout> | undefined;
	private endsAt: number | undefined;

	readonly remainingMs = signal<number | undefined>(undefined);

	private readonly _noticeMinutes = signal<number | undefined>(undefined);

	/**
	 * Whole minutes left when the warning arrived, or `undefined` once the one-off notice announcing
	 * it is gone. Frozen at that moment rather than derived from {@link remainingMs}: the notice is
	 * transient, and the status rail's countdown is what stays exact afterwards.
	 */
	readonly noticeMinutes = this._noticeMinutes.asReadonly();

	/**
	 * Starts the countdown, ending `remainingMs` milliseconds from now, and announces it once.
	 */
	start(remainingMs: number): void {
		this.endsAt = Date.now() + remainingMs;
		this.clearTick();
		this.tick();
		this.tickHandle = setInterval(() => this.tick(), 1000);
		this.showNotice(Math.ceil(remainingMs / 60_000));
	}

	dismissNotice(): void {
		this.clearNoticeTimeout();
		this._noticeMinutes.set(undefined);
	}

	private showNotice(minutes: number): void {
		this.clearNoticeTimeout();
		this._noticeMinutes.set(minutes);
		this.noticeHandle = setTimeout(() => this.dismissNotice(), MeetingEndingSoonService.NOTICE_TIMEOUT_MS);
	}

	private clearNoticeTimeout(): void {
		if (this.noticeHandle) {
			clearTimeout(this.noticeHandle);
			this.noticeHandle = undefined;
		}
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
