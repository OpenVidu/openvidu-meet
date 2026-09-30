import { computed, Service, signal } from '@angular/core';
import { MeetBroadcastInfo, MeetBroadcastStatus } from '@openvidu-meet/typings';
import {
	BroadcastRequestState,
	BroadcastRequestStatus,
	isBroadcastInProgress,
	isDestinationStreaming
} from '../../models/broadcast.model';

const zeroElapsed = () => new Date(0, 0, 0, 0, 0, 0);

/**
 * The live broadcast of the meeting as the server last reported it, plus what the local
 * participant has asked of it and is still waiting for. The status rail's LIVE chip and the
 * activity both read it.
 */
@Service()
export class BroadcastStateService {
	private timer: ReturnType<typeof setInterval> | undefined;

	private readonly _broadcast = signal<MeetBroadcastInfo | undefined>(undefined);
	private readonly _request = signal<BroadcastRequestState>({ status: 'idle' });
	private readonly _elapsed = signal(zeroElapsed());

	/** The broadcast, while it runs or right after it failed; `undefined` once it ended normally. */
	readonly broadcast = this._broadcast.asReadonly();
	readonly request = this._request.asReadonly();
	/**
	 * How long the broadcast has been live, as a `Date` offset from zero so it can be formatted with
	 * the `date` pipe. Not the moment it started.
	 */
	readonly elapsed = this._elapsed.asReadonly();

	readonly isLive = computed(() => this._broadcast()?.status === MeetBroadcastStatus.ACTIVE);
	readonly isStarting = computed(
		() => this._broadcast()?.status === MeetBroadcastStatus.STARTING || this._request().status === 'starting'
	);
	readonly isEnding = computed(
		() => this._broadcast()?.status === MeetBroadcastStatus.ENDING || this._request().status === 'stopping'
	);
	readonly isInProgress = computed(() => this.isStarting() || this.isLive() || this.isEnding());
	readonly hasFailed = computed(() => {
		const status = this._broadcast()?.status;
		return status === MeetBroadcastStatus.FAILED || status === MeetBroadcastStatus.LIMIT_REACHED;
	});
	readonly streamingDestinationCount = computed(
		() => this._broadcast()?.destinations.filter(isDestinationStreaming).length ?? 0
	);

	/** Takes what the server reports; it answers whatever request was pending. */
	setBroadcast(broadcast: MeetBroadcastInfo): void {
		const shouldKeep = isBroadcastInProgress(broadcast.status) || broadcast.status === MeetBroadcastStatus.FAILED;
		this._broadcast.set(shouldKeep ? broadcast : undefined);
		this._request.set({ status: 'idle' });
		this.trackElapsed(broadcast.status === MeetBroadcastStatus.ACTIVE ? broadcast.startDate : undefined);
	}

	setRequest(status: BroadcastRequestStatus, error?: string): void {
		this._request.set({ status, error });
	}

	/** Forgets a failure, of the broadcast or of a request, so the activity offers to start again. */
	dismissFailure(): void {
		if (this.hasFailed()) {
			this._broadcast.set(undefined);
		}

		this._request.set({ status: 'idle' });
	}

	reset(): void {
		this._broadcast.set(undefined);
		this._request.set({ status: 'idle' });
		this.trackElapsed(undefined);
	}

	private trackElapsed(startDate: number | undefined): void {
		clearInterval(this.timer);
		this.timer = undefined;

		if (startDate === undefined) {
			this._elapsed.set(zeroElapsed());
			return;
		}

		const update = () => {
			const elapsed = zeroElapsed();
			elapsed.setSeconds(Math.max(0, Math.floor((Date.now() - startDate) / 1000)));
			this._elapsed.set(elapsed);
		};

		update();
		this.timer = setInterval(update, 1000);
	}
}
