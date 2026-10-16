import { computed, Service, signal } from '@angular/core';
import { MeetBroadcastInfo, MeetBroadcastStatus } from '@openvidu-meet/typings';
import { ElapsedClock } from '../../../../../shared/utils/elapsed-clock';
import {
	broadcastDestinationKey,
	BroadcastRequestState,
	BroadcastRequestStatus,
	hasBroadcastFailed,
	isBroadcastInProgress
} from '../../models/broadcast.model';

/**
 * The live broadcasts of the meeting as the server last reported them, one per destination, plus
 * what the local participant has asked of them and is still waiting for. The status rail's LIVE
 * chip and the activity both read it.
 */
@Service()
export class BroadcastStateService {
	private readonly clock = new ElapsedClock();
	private readonly _broadcasts = signal<MeetBroadcastInfo[]>([]);
	private readonly _request = signal<BroadcastRequestState>({ status: 'idle' });
	private clockedStart: number | undefined;

	/**
	 * The broadcasts in progress, plus the failed ones kept until the failure is dismissed; a
	 * broadcast that ended normally is forgotten.
	 */
	readonly broadcasts = this._broadcasts.asReadonly();
	readonly request = this._request.asReadonly();
	/**
	 * How long the meeting has been live, as a `Date` offset from zero so it can be formatted with
	 * the `date` pipe. Not the moment it started.
	 */
	readonly elapsed = this.clock.elapsed;

	readonly inProgress = computed(() => this._broadcasts().filter(({ status }) => isBroadcastInProgress(status)));
	readonly failed = computed(() => this._broadcasts().filter(({ status }) => hasBroadcastFailed(status)));
	readonly isLive = computed(() => this._broadcasts().some(({ status }) => status === MeetBroadcastStatus.ACTIVE));
	readonly isStarting = computed(
		() =>
			this._broadcasts().some(({ status }) => status === MeetBroadcastStatus.STARTING) ||
			this._request().status === 'starting'
	);
	readonly isEnding = computed(
		() =>
			this._broadcasts().some(({ status }) => status === MeetBroadcastStatus.ENDING) ||
			this._request().status === 'stopping'
	);
	readonly isInProgress = computed(() => this.isStarting() || this.isLive() || this.isEnding());
	/** Nothing streams and something failed: what the activity reports as a failure to go live. */
	readonly hasFailed = computed(() => this.inProgress().length === 0 && this.failed().length > 0);
	/** The destinations media has reached, not those still connecting. */
	readonly liveDestinationCount = computed(
		() => this._broadcasts().filter(({ status }) => status === MeetBroadcastStatus.ACTIVE).length
	);

	/**
	 * Takes what the server reports of one broadcast. A new attempt at a destination replaces the
	 * failed one kept for it, and the normal end of the last broadcast in progress forgets every
	 * failure kept: the meeting stopped streaming, which is no failure to go live.
	 */
	setBroadcast(broadcast: MeetBroadcastInfo): void {
		const key = broadcastDestinationKey(broadcast);
		const failed = hasBroadcastFailed(broadcast.status);
		const keep = isBroadcastInProgress(broadcast.status) || failed;

		this._broadcasts.update((broadcasts) => {
			const known = broadcasts.some(({ broadcastId }) => broadcastId === broadcast.broadcastId);
			const placed = known
				? broadcasts.map((other) => (other.broadcastId === broadcast.broadcastId ? broadcast : other))
				: [...broadcasts, broadcast];
			const kept = placed.filter((other) =>
				other === broadcast
					? keep
					: !(hasBroadcastFailed(other.status) && broadcastDestinationKey(other) === key)
			);
			const stoppedStreaming = !keep && !kept.some(({ status }) => isBroadcastInProgress(status));

			return stoppedStreaming ? kept.filter(({ status }) => !hasBroadcastFailed(status)) : kept;
		});
		this.trackElapsed();
	}

	setRequest(status: BroadcastRequestStatus, error?: string): void {
		this._request.set({ status, error });
	}

	/** Forgets the failures, of broadcasts and of requests, so the activity offers to start again. */
	dismissFailure(): void {
		this._broadcasts.update((broadcasts) => broadcasts.filter(({ status }) => !hasBroadcastFailed(status)));
		this._request.set({ status: 'idle' });
	}

	reset(): void {
		this._broadcasts.set([]);
		this._request.set({ status: 'idle' });
		this.trackElapsed();
	}

	/** Clocks the meeting from the first broadcast that went live among those still live. */
	private trackElapsed(): void {
		const starts = this._broadcasts()
			.filter(({ status }) => status === MeetBroadcastStatus.ACTIVE)
			.map(({ startDate }) => startDate)
			.filter((startDate): startDate is number => startDate !== undefined);
		const start = starts.length > 0 ? Math.min(...starts) : undefined;

		if (start === this.clockedStart) return;

		this.clockedStart = start;

		if (start === undefined) {
			this.clock.stop();
		} else {
			this.clock.start(start);
		}
	}
}
