import { inject, Service, signal } from '@angular/core';
import { SoundService } from '../../../../../shared/services/sound.service';

/**
 * Announces that a duration-limited meeting is about to be force-ended, and counts down to its end.
 *
 * That end is tracked from the meeting's own end date, which every participant reads off the LiveKit
 * room metadata; the server's ending-soon signal only covers a meeting whose metadata carries none.
 * The end date reaches this service already converted to the device's clock, so everything here is
 * timed against `Date.now()`.
 */
@Service()
export class MeetingEndingSoonService {
	private static readonly NOTICE_WINDOW_MS = 5 * 60_000;
	private static readonly NOTICE_DURATION_MS = 12_000;

	private readonly soundService = inject(SoundService);

	private endsAt: number | undefined;
	private announceHandle: ReturnType<typeof setTimeout> | undefined;
	private dismissHandle: ReturnType<typeof setTimeout> | undefined;
	private countdownHandle: ReturnType<typeof setInterval> | undefined;

	private readonly _remainingMs = signal<number | undefined>(undefined);
	private readonly _noticeMinutes = signal<number | undefined>(undefined);

	/** Milliseconds left before the meeting is force-ended, `undefined` until it is announced. */
	readonly remainingMs = this._remainingMs.asReadonly();

	/**
	 * Whole minutes left when the meeting was announced, `undefined` once the notice is gone. Frozen
	 * at that moment rather than derived from {@link remainingMs}, which goes on counting after it.
	 */
	readonly noticeMinutes = this._noticeMinutes.asReadonly();

	/**
	 * Tracks the instant this meeting is force-ended, in the device's clock, announcing it as soon as
	 * the meeting is inside the notice window. Called once per meeting, with `undefined` for one that
	 * has no end to track, so it also drops what the previous meeting left behind.
	 */
	trackMeetingEnd(endsAt: number | undefined): void {
		this.reset();
		this.endsAt = endsAt;

		if (endsAt === undefined) return;

		const remainingMs = endsAt - Date.now();

		if (remainingMs <= 0) return;

		if (remainingMs <= MeetingEndingSoonService.NOTICE_WINDOW_MS) {
			this.announceEndingSoon();
			return;
		}

		this.announceHandle = setTimeout(
			() => this.announceEndingSoon(),
			remainingMs - MeetingEndingSoonService.NOTICE_WINDOW_MS
		);
	}

	/** Announces a meeting ending `remainingMs` from now, unless its end is already known. */
	warnEndingIn(remainingMs: number): void {
		if (this.endsAt !== undefined) return;

		this.endsAt = Date.now() + remainingMs;
		this.announceEndingSoon();
	}

	dismissNotice(): void {
		clearTimeout(this.dismissHandle);
		this.dismissHandle = undefined;
		this._noticeMinutes.set(undefined);
	}

	private announceEndingSoon(): void {
		if (this.endsAt === undefined) return;

		this.startCountdown();
		this.showNotice(Math.ceil((this.endsAt - Date.now()) / 60_000));
	}

	private startCountdown(): void {
		this.clearCountdown();
		this.tick();
		this.countdownHandle = setInterval(() => this.tick(), 1000);
	}

	private tick(): void {
		if (this.endsAt === undefined) return;

		const remainingMs = Math.max(0, this.endsAt - Date.now());
		this._remainingMs.set(remainingMs);

		if (remainingMs === 0) {
			this.clearCountdown();
		}
	}

	private showNotice(minutes: number): void {
		this.dismissNotice();
		this._noticeMinutes.set(minutes);
		this.dismissHandle = setTimeout(() => this.dismissNotice(), MeetingEndingSoonService.NOTICE_DURATION_MS);
		this.soundService.playMeetingEndingSoonSound();
	}

	private reset(): void {
		clearTimeout(this.announceHandle);
		this.announceHandle = undefined;
		this.clearCountdown();
		this.dismissNotice();
		this.endsAt = undefined;
		this._remainingMs.set(undefined);
	}

	private clearCountdown(): void {
		clearInterval(this.countdownHandle);
		this.countdownHandle = undefined;
	}
}
