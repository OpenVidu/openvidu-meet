import { inject, Service, signal } from '@angular/core';
import { SoundService } from '../../../../../shared/services/sound.service';

/**
 * Announces that a duration-limited meeting is about to be force-ended, once, and counts down to it
 * from there.
 *
 * It follows the meeting's own deadline ({@link watch}), which every participant reads off the
 * LiveKit room metadata, so someone who joined late or reconnected counts down to the same instant
 * as everyone else. The server's `MEET_MEETING_ENDING_SOON` signal ({@link warn}) is the fallback
 * for a meeting whose deadline this client could not read.
 *
 * Everything is timed against `Date.now()`, the deadline having been converted to this device's
 * clock before it gets here.
 *
 * `remainingMs` clamps at 0 instead of going negative: the backend force-ends the meeting on its
 * own timer at that same deadline, and the actual `meetingEnded`/room-closed flow takes over from
 * there.
 */
@Service()
export class MeetingEndingSoonService {
	private static readonly NOTICE_TIMEOUT_MS = 12_000;
	/** How long before its end a meeting is announced as ending soon. */
	private static readonly NOTICE_WINDOW_MS = 5 * 60_000;

	private readonly soundService = inject(SoundService);

	private tickHandle: ReturnType<typeof setInterval> | undefined;
	private noticeHandle: ReturnType<typeof setTimeout> | undefined;
	private announceHandle: ReturnType<typeof setTimeout> | undefined;
	private deadline: number | undefined;
	private endsAt: number | undefined;

	private readonly _remainingMs = signal<number | undefined>(undefined);
	private readonly _noticeMinutes = signal<number | undefined>(undefined);

	/** Milliseconds left before the meeting is force-ended, once it has been announced. */
	readonly remainingMs = this._remainingMs.asReadonly();

	/**
	 * Whole minutes left when the meeting was announced, or `undefined` once the one-off notice
	 * announcing it is gone. Frozen at that moment rather than derived from {@link remainingMs}: the
	 * notice is transient, and the status rail's countdown is what stays exact afterwards.
	 */
	readonly noticeMinutes = this._noticeMinutes.asReadonly();

	/**
	 * Follows `deadline`, the instant this meeting is force-ended in this device's clock, announcing
	 * it once the meeting enters the notice window and immediately if it is already inside. Pass
	 * `undefined` for a meeting with no deadline to follow, which leaves {@link warn} as the only
	 * source. Called once per meeting, so it also drops whatever the previous meeting left behind.
	 */
	watch(deadline: number | undefined): void {
		this.reset();
		this.deadline = deadline;

		if (deadline === undefined) return;

		const remainingMs = deadline - Date.now();

		if (remainingMs <= 0) return;

		if (remainingMs <= MeetingEndingSoonService.NOTICE_WINDOW_MS) {
			this.announce(deadline);
			return;
		}

		this.announceHandle = setTimeout(
			() => this.announce(deadline),
			remainingMs - MeetingEndingSoonService.NOTICE_WINDOW_MS
		);
	}

	/**
	 * Announces a meeting ending `remainingMs` from now, as the server's warning reports it. Ignored
	 * while a deadline is being followed: that is the same warning, exact and already delivered.
	 */
	warn(remainingMs: number): void {
		if (this.deadline !== undefined) return;

		this.announce(Date.now() + remainingMs);
	}

	dismissNotice(): void {
		this.clearNoticeTimeout();
		this._noticeMinutes.set(undefined);
	}

	private announce(endsAt: number): void {
		this.endsAt = endsAt;
		this.clearTick();
		this.tick();
		this.tickHandle = setInterval(() => this.tick(), 1000);
		this.showNotice(Math.ceil((endsAt - Date.now()) / 60_000));
		this.soundService.playMeetingEndingSoonSound();
	}

	private reset(): void {
		this.clearAnnounceTimeout();
		this.clearTick();
		this.dismissNotice();
		this.deadline = undefined;
		this.endsAt = undefined;
		this._remainingMs.set(undefined);
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

	private clearAnnounceTimeout(): void {
		if (this.announceHandle) {
			clearTimeout(this.announceHandle);
			this.announceHandle = undefined;
		}
	}

	private tick(): void {
		if (this.endsAt === undefined) return;

		const remaining = Math.max(0, this.endsAt - Date.now());
		this._remainingMs.set(remaining);

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
