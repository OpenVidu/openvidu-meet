import { inject, Service, signal } from '@angular/core';
import { NotificationService } from '../../../../../shared/services/notification.service';
import { SoundService } from '../../../../../shared/services/sound.service';

/**
 * Announces that a duration-limited meeting is about to be force-ended, and counts down to its end.
 *
 * The end is tracked from the meeting's own end date, which every participant reads off the LiveKit
 * room metadata, converted to the device's clock before it gets here, so everything is timed
 * against `Date.now()`.
 */
@Service()
export class MeetingEndingSoonService {
	private static readonly NOTICE_WINDOW_MS = 5 * 60_000;
	private static readonly NOTICE_DURATION_MS = 12_000;

	private readonly soundService = inject(SoundService);
	private readonly notificationService = inject(NotificationService);

	private endsAt: number | undefined;
	private announceHandle: ReturnType<typeof setTimeout> | undefined;
	private countdownHandle: ReturnType<typeof setInterval> | undefined;
	private shownId: number | undefined;

	private readonly _remainingMs = signal<number | undefined>(undefined);

	/** Milliseconds left before the meeting is force-ended, `undefined` until it is announced. */
	readonly remainingMs = this._remainingMs.asReadonly();

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

	/**
	 * The minutes left are frozen into the announcement rather than counted down in it: the countdown
	 * belongs to the status rail, which keeps it for the whole window, while this is read once.
	 */
	private showNotice(minutes: number): void {
		this.dismissNotice();
		this.shownId = this.notificationService.showNotification({
			kind: 'meeting-ending-soon',
			icon: 'schedule',
			tone: 'warning',
			titleKey: 'ROOM.ENDING_SOON_TITLE',
			messageKey: minutes === 1 ? 'ROOM.ENDING_SOON_ONE_MINUTE' : 'ROOM.ENDING_SOON_MANY_MINUTES',
			messageParams: { minutes },
			dismissLabelKey: 'ROOM.ENDING_SOON_DISMISS',
			durationMs: MeetingEndingSoonService.NOTICE_DURATION_MS
		});
		this.soundService.playMeetingEndingSoonSound();
	}

	private dismissNotice(): void {
		if (this.shownId === undefined) return;

		this.notificationService.dismissNotification(this.shownId);
		this.shownId = undefined;
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
