import { computed, Service, signal } from '@angular/core';
import { MeetBroadcastInfo, MeetBroadcastStartDestination, MeetBroadcastStatus } from '@openvidu-meet/typings';
import type { BroadcastDestinationDraft } from '../../../../../shared/utils/broadcast-destination-editor';
import { ElapsedClock } from '../../../../../shared/utils/elapsed-clock';
import {
	broadcastDestinationKey,
	broadcastProgress,
	BroadcastRequestedEvent,
	BroadcastRequestRefusal,
	hasBroadcastFailed,
	isBroadcastInProgress,
	MeetingDestination
} from '../../models/broadcast.model';

/**
 * The live broadcasts of the meeting as the server last reported them, one per destination, plus
 * each request the local participant made of them that the server has not answered yet, and the
 * last one it refused. Requests run side by side: one going on or answered says nothing of another.
 * The status rail's LIVE chip and the activity both read it. It also holds the destinations the
 * local participant chose in the activity, which outlive the panel until they leave the meeting.
 */
@Service()
export class BroadcastStateService {
	private readonly clock = new ElapsedClock();
	private readonly _broadcasts = signal<MeetBroadcastInfo[]>([]);
	private readonly _pendingRequests = signal<BroadcastRequestedEvent[]>([]);
	private readonly _refusal = signal<BroadcastRequestRefusal | undefined>(undefined);
	private readonly _ownUrls = signal(new Map<string, string>());
	private readonly _leftOutRoomDestinationIds = signal(new Set<string>());
	private readonly _meetingDestinations = signal<MeetingDestination[]>([]);
	private readonly endedIds = new Set<string>();
	private clockedStart: number | undefined;
	private meetingDestinationCount = 0;

	/**
	 * The broadcasts in progress, plus the failed ones kept until the failure is dismissed; a
	 * broadcast that ended normally is forgotten.
	 */
	readonly broadcasts = this._broadcasts.asReadonly();
	readonly pendingRequests = this._pendingRequests.asReadonly();
	/** The last request the server refused, until it is dismissed or something else is asked. */
	readonly refusal = this._refusal.asReadonly();
	/**
	 * The full URL of each broadcast the local participant started to a destination given for the
	 * meeting, by broadcast id: the server only reports URLs redacted, alike for every destination
	 * on one platform, so this is what ties such a broadcast to the destination it was asked for.
	 */
	readonly ownUrls = this._ownUrls.asReadonly();
	/** The room destinations the local participant left out of going live; every other one is chosen. */
	readonly leftOutRoomDestinationIds = this._leftOutRoomDestinationIds.asReadonly();
	readonly meetingDestinations = this._meetingDestinations.asReadonly();
	/**
	 * How long the meeting has been live, as a `Date` offset from zero so it can be formatted with
	 * the `date` pipe. Not the moment it started.
	 */
	readonly elapsed = this.clock.elapsed;

	readonly inProgress = computed(() => this._broadcasts().filter(({ status }) => isBroadcastInProgress(status)));
	readonly failed = computed(() => this._broadcasts().filter(({ status }) => hasBroadcastFailed(status)));
	readonly isLive = computed(() => this._broadcasts().some(({ status }) => status === MeetBroadcastStatus.ACTIVE));
	readonly isStartPending = computed(() => this._pendingRequests().some(({ action }) => action === 'start'));
	readonly isStarting = computed(
		() => this._broadcasts().some(({ status }) => status === MeetBroadcastStatus.STARTING) || this.isStartPending()
	);
	readonly isEnding = computed(
		() =>
			this._broadcasts().some(({ status }) => status === MeetBroadcastStatus.ENDING) ||
			this._pendingRequests().some(({ action }) => action === 'stop')
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
	 * failure kept: the meeting stopped streaming, which is no failure to go live. A broadcast only
	 * moves forward: a report older than what is known of it, such as the repeat a joining
	 * participant gets after the end already reached them, changes nothing.
	 */
	setBroadcast(broadcast: MeetBroadcastInfo): void {
		const known = this._broadcasts().find(({ broadcastId }) => broadcastId === broadcast.broadcastId);
		const reached = this.endedIds.has(broadcast.broadcastId)
			? broadcastProgress(MeetBroadcastStatus.COMPLETE)
			: known && broadcastProgress(known.status);

		if (reached !== undefined && broadcastProgress(broadcast.status) < reached) return;

		if (!isBroadcastInProgress(broadcast.status)) this.endedIds.add(broadcast.broadcastId);

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

	/**
	 * Records the destination given for the meeting that each broadcast of a start the local
	 * participant asked for streams to. The server answers the room destinations first and then
	 * those given for the meeting, in the order they were asked for.
	 */
	recordOwnBroadcasts(destinations: MeetBroadcastStartDestination[], broadcasts: MeetBroadcastInfo[]): void {
		const urls = new Map(this._ownUrls());
		const forMeeting = broadcasts.filter(({ destination }) => !destination.id);

		destinations.forEach(({ url }, index) => {
			if (forMeeting[index]) urls.set(forMeeting[index].broadcastId, url);
		});
		this._ownUrls.set(urls);
	}

	/** Something new is asked, so the last refusal no longer stands. */
	requestStarted(request: BroadcastRequestedEvent): void {
		this._refusal.set(undefined);
		this._pendingRequests.update((requests) => [...requests, request]);
	}

	requestSucceeded(request: BroadcastRequestedEvent): void {
		this.settle(request);
	}

	/** A request asked before the last {@link reset} belongs to another meeting, so its refusal is not shown. */
	requestFailed(request: BroadcastRequestedEvent, error?: string): void {
		if (this.settle(request)) this._refusal.set({ request, error });
	}

	/** Forgets the failures, of broadcasts and of requests, so the activity offers to start again. */
	dismissFailure(): void {
		this._broadcasts.update((broadcasts) => broadcasts.filter(({ status }) => !hasBroadcastFailed(status)));
		this._refusal.set(undefined);
	}

	chooseRoomDestination(destinationId: string, chosen: boolean): void {
		this._leftOutRoomDestinationIds.update((ids) => {
			const next = new Set(ids);

			if (chosen) {
				next.delete(destinationId);
			} else {
				next.add(destinationId);
			}

			return next;
		});
	}

	/** Lists the destination with a local id no other destination of this client has had. */
	addMeetingDestination(draft: BroadcastDestinationDraft): MeetingDestination {
		const destination = { ...draft, id: `meeting-${++this.meetingDestinationCount}` };
		this._meetingDestinations.update((destinations) => [...destinations, destination]);
		return destination;
	}

	removeMeetingDestination(id: string): void {
		this._meetingDestinations.update((destinations) => destinations.filter((destination) => destination.id !== id));
	}

	reset(): void {
		this._broadcasts.set([]);
		this._pendingRequests.set([]);
		this._refusal.set(undefined);
		this._ownUrls.set(new Map());
		this._leftOutRoomDestinationIds.set(new Set());
		this._meetingDestinations.set([]);
		this.endedIds.clear();
		this.trackElapsed();
	}

	/** Whether the request was still pending. */
	private settle(request: BroadcastRequestedEvent): boolean {
		const requests = this._pendingRequests();
		this._pendingRequests.set(requests.filter((pending) => pending !== request));
		return requests.includes(request);
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
