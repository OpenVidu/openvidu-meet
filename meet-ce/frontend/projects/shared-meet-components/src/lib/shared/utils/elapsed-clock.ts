import { signal } from '@angular/core';

const zeroElapsed = () => new Date(0, 0, 0, 0, 0, 0);

/**
 * Counts the time since an instant, once a second, as a `Date` offset from zero so the `date` pipe
 * can format it: what the status rail and the activities show while something runs.
 */
export class ElapsedClock {
	private timer: ReturnType<typeof setInterval> | undefined;
	private readonly _elapsed = signal(zeroElapsed());

	/** The time since the start, zero while stopped. */
	readonly elapsed = this._elapsed.asReadonly();

	start(startDate: number): void {
		clearInterval(this.timer);

		const tick = () => {
			const elapsed = zeroElapsed();
			elapsed.setSeconds(Math.max(0, Math.floor((Date.now() - startDate) / 1000)));
			this._elapsed.set(elapsed);
		};

		tick();
		this.timer = setInterval(tick, 1000);
	}

	stop(): void {
		clearInterval(this.timer);
		this.timer = undefined;
		this._elapsed.set(zeroElapsed());
	}
}
