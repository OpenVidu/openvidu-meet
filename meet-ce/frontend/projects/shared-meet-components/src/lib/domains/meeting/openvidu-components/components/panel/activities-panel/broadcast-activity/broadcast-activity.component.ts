import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
	MEET_BROADCAST_MAX_DESTINATIONS,
	MeetBroadcastInfo,
	MeetBroadcastStartDestination,
	MeetBroadcastStatus,
	redactStreamUrl
} from '@openvidu-meet/typings';
import { PlatformIconComponent } from '../../../../../../../shared/components/platform-icon/platform-icon.component';
import {
	BROADCAST_MBPS_PER_DESTINATION,
	broadcastUploadMbps
} from '../../../../../../../shared/models/broadcast.model';
import {
	BroadcastDestinationDraft,
	DestinationEditor
} from '../../../../../../../shared/utils/broadcast-destination-editor';
import {
	detectBroadcastPlatform,
	extractBroadcastHost
} from '../../../../../../../shared/utils/broadcast-platform.utils';
import { MeetingContextService } from '../../../../../services/meeting-context.service';
import {
	BroadcastPhase,
	BroadcastRequest,
	BroadcastRequestedEvent,
	isBroadcastInProgress,
	isBroadcastRunning,
	startsMeetingDestination,
	startsRoomDestination,
	stopsBroadcast
} from '../../../../models/broadcast.model';
import { TranslatePipe } from '../../../../pipes/translate.pipe';
import { BroadcastStateService } from '../../../../services/broadcast/broadcast-state.service';
import { MeetingUiConfigService } from '../../../../services/config/meeting-ui-config.service';
import { MeetingLiveKitService } from '../../../../services/meeting-livekit/meeting-livekit.service';
import { ParticipantService } from '../../../../services/participant/participant.service';
import { ActivityItemComponent, ActivityState } from '../activity-item/activity-item.component';

/** How a destination row is doing, from the broadcast to it or from what was just asked. */
type RowStatus = 'connecting' | 'live' | 'stopping' | 'stopped' | 'failed';

/** A destination the local participant gave for the meeting, whose full URL only this client knows. */
interface MeetingDestination extends BroadcastDestinationDraft {
	/** Local to this client, never sent: it tells apart destinations whose URLs redact alike */
	id: string;
}

/** A room destination by its id, or a destination given for the meeting by its name and full URL. */
type DestinationStart = { destinationId: string } | MeetBroadcastStartDestination;

/**
 * A destination as the activity lists it: one of the room's, or one given for this meeting, with
 * the broadcast to it when there is one.
 */
interface DestinationRow {
	/**
	 * The room destination's id, the local id of a destination this client gave for the meeting,
	 * or the id of the broadcast to one given by someone else
	 */
	key: string;
	name: string;
	url: string;
	source: 'room' | 'meeting';
	broadcast?: MeetBroadcastInfo;
	/** How to start a broadcast to it; absent when this client does not know the full URL */
	start?: DestinationStart;
	selected: boolean;
	status: RowStatus;
}

const STATUS_KEYS: Record<BroadcastPhase, string> = {
	idle: 'PANEL.BROADCAST.STATUS_NOT_LIVE',
	starting: 'PANEL.BROADCAST.STATUS_STARTING',
	live: 'PANEL.BROADCAST.STATUS_LIVE',
	ending: 'PANEL.BROADCAST.STATUS_STOPPING',
	failed: 'PANEL.BROADCAST.STATUS_FAILED'
};

const ACTIVITY_STATES: Record<BroadcastPhase, ActivityState> = {
	idle: 'idle',
	starting: 'pending',
	live: 'live',
	ending: 'pending',
	failed: 'failed'
};

const ROW_STATUS_BY_BROADCAST: Record<MeetBroadcastStatus, RowStatus> = {
	[MeetBroadcastStatus.STARTING]: 'connecting',
	[MeetBroadcastStatus.ACTIVE]: 'live',
	[MeetBroadcastStatus.ENDING]: 'stopping',
	[MeetBroadcastStatus.COMPLETE]: 'stopped',
	[MeetBroadcastStatus.ABORTED]: 'stopped',
	[MeetBroadcastStatus.FAILED]: 'failed',
	[MeetBroadcastStatus.LIMIT_REACHED]: 'failed'
};

const STREAMING_ROW_STATUSES: RowStatus[] = ['connecting', 'live', 'stopping'];

const ROW_STATUS_KEYS: Record<RowStatus, string> = {
	connecting: 'PANEL.BROADCAST.DEST_CONNECTING',
	live: 'PANEL.BROADCAST.DEST_LIVE',
	stopping: 'PANEL.BROADCAST.STATUS_STOPPING',
	stopped: 'PANEL.BROADCAST.DEST_STOPPED',
	failed: 'PANEL.BROADCAST.DEST_FAILED'
};

/**
 * The **BroadcastActivityComponent** shows the live broadcasts of the meeting, one per
 * destination: where it streams, how each destination is doing, and the controls to go live, stop,
 * and stream to one more destination for this meeting.
 */
@Component({
	selector: 'ov-broadcast-activity',
	imports: [
		ActivityItemComponent,
		NgTemplateOutlet,
		ReactiveFormsModule,
		MatButtonModule,
		MatCheckboxModule,
		MatFormFieldModule,
		MatIconModule,
		MatInputModule,
		MatTooltipModule,
		PlatformIconComponent,
		TranslatePipe
	],
	templateUrl: './broadcast-activity.component.html',
	styleUrls: ['../activity-shared.scss', './broadcast-activity.component.scss']
})
export class BroadcastActivityComponent {
	private readonly uiConfig = inject(MeetingUiConfigService);
	private readonly broadcastState = inject(BroadcastStateService);
	private readonly participantService = inject(ParticipantService);
	private readonly meetingLiveKitService = inject(MeetingLiveKitService);
	private readonly meetingContext = inject(MeetingContextService);
	private readonly formBuilder = inject(FormBuilder);

	/**
	 * @internal
	 */
	expanded = input(false);

	/**
	 * Fired whenever the user asks something of the broadcasts: going live, stopping, or starting
	 * and stopping the stream to one destination. See {@link BroadcastRequestedEvent}.
	 */
	onBroadcastRequested = output<BroadcastRequestedEvent>();

	readonly maxDestinations = MEET_BROADCAST_MAX_DESTINATIONS;
	readonly mbpsPerDestination = BROADCAST_MBPS_PER_DESTINATION;

	readonly elapsed = this.broadcastState.elapsed;
	readonly showControls = this.uiConfig.broadcastActivityControlsSignal;
	private readonly pendingRequests = this.broadcastState.pendingRequests;
	private readonly showAddDestinations = this.uiConfig.broadcastActivityAddDestinationsSignal;

	/** A refusal of what was last asked, shown until dismissed; one of a destination being added shows in its editor. */
	readonly requestError = computed(() => {
		const refusal = this.broadcastState.refusal();
		const adding = this.addingDestination();

		if (!refusal || (adding && startsMeetingDestination(refusal.request, adding.url))) return undefined;

		return refusal.error ?? '';
	});
	readonly phase = computed<BroadcastPhase>(() => {
		if (
			this.broadcastState.hasFailed() ||
			(this.requestError() !== undefined && !this.broadcastState.isInProgress())
		) {
			return 'failed';
		}

		if (this.broadcastState.isLive()) return 'live';

		if (this.broadcastState.isEnding()) return 'ending';

		return this.broadcastState.isStarting() ? 'starting' : 'idle';
	});
	readonly statusKey = computed(() => STATUS_KEYS[this.phase()]);
	readonly state = computed<ActivityState>(() => ACTIVITY_STATES[this.phase()]);
	readonly isRunning = computed(() => this.phase() === 'starting' || this.phase() === 'live');

	readonly liveCount = this.broadcastState.liveDestinationCount;
	readonly failedCount = computed(() => this.broadcastState.failed().length);
	readonly liveMbps = computed(() => broadcastUploadMbps(this.liveCount()));
	readonly failure = computed(() => {
		const [failed] = this.broadcastState.failed();
		return this.requestError() || failed?.error || failed?.details;
	});

	// The room's destinations, all chosen unless unticked, with the ones given for this meeting
	// from this client, whose full URL only this client knows.
	private readonly roomDestinations = computed(() => this.meetingContext.broadcastConfig()?.destinations ?? []);
	private readonly unselectedIds = signal(new Set<string>());
	private readonly meetingDestinations = signal<MeetingDestination[]>([]);
	private meetingDestinationCount = 0;

	readonly rows = computed<DestinationRow[]>(() => {
		const broadcasts = this.broadcastState.broadcasts();
		const ownUrls = this.broadcastState.ownUrls();
		const ownBroadcastTo = (url: string) =>
			broadcasts.filter(({ broadcastId }) => ownUrls.get(broadcastId) === url).at(-1);
		const local = this.meetingDestinations().map((destination) => ({
			destination,
			broadcast: ownBroadcastTo(destination.url)
		}));
		const listed = new Set(local.map(({ broadcast }) => broadcast?.broadcastId));
		// Until a start of destinations this client gave for the meeting is answered, a broadcast it
		// does not know as its own yet may be one of them, which already have their rows.
		const ownStartsAnswered = !this.pendingRequests().some(
			(request) => request.action === 'start' && request.destinations?.length
		);
		const otherBroadcasts = broadcasts.filter(
			({ broadcastId, destination }) =>
				!destination.id && !listed.has(broadcastId) && (ownStartsAnswered || ownUrls.has(broadcastId))
		);

		return [
			...this.roomDestinations().map(({ id, name, url }) =>
				this.toRow({
					key: id!,
					name,
					url,
					source: 'room',
					broadcast: broadcasts.find(({ destination }) => destination.id === id),
					start: { destinationId: id! },
					selected: !this.unselectedIds().has(id!)
				})
			),
			...local.map(({ destination: { id, name, url }, broadcast }) =>
				this.toRow({
					key: id,
					name,
					url: redactStreamUrl(url),
					source: 'meeting',
					broadcast,
					start: { name, url },
					selected: true
				})
			),
			...otherBroadcasts.map((broadcast) => {
				const ownUrl = ownUrls.get(broadcast.broadcastId);
				const { name, url } = broadcast.destination;
				return this.toRow({
					key: broadcast.broadcastId,
					name,
					url,
					source: 'meeting',
					broadcast,
					start: ownUrl ? { name, url: ownUrl } : undefined,
					selected: true
				});
			})
		];
	});
	readonly selectedCount = computed(() => this.rows().filter(({ selected }) => selected).length);
	/** The destinations streamed to, including those a start is still waiting for the server to report. */
	readonly streamingCount = computed(
		() => this.rows().filter(({ status }) => STREAMING_ROW_STATUSES.includes(status)).length
	);
	readonly plannedMbps = computed(() => broadcastUploadMbps(this.selectedCount()));
	readonly canAddDestination = computed(() => {
		const count = this.isRunning() ? this.streamingCount() : this.selectedCount();
		return this.showAddDestinations() && !this.editorOpen() && count < this.maxDestinations;
	});

	readonly hasRoomTracksPublished = signal(false);
	readonly canGoLive = computed(
		() => this.selectedCount() > 0 && this.hasRoomTracksPublished() && !this.broadcastState.isStartPending()
	);

	readonly editor = new DestinationEditor(this.formBuilder);
	readonly editorOpen = signal(false);
	/** The destination given for the meeting while live whose start the server has not answered yet. */
	readonly addingDestination = signal<MeetingDestination | undefined>(undefined);
	/** Adding a destination while live streams to it at once, so the editor says so. */
	readonly submitLabelKey = computed(() => {
		if (!this.isRunning()) return 'PANEL.BROADCAST.ADD';

		return this.editor.rejection() === undefined
			? 'PANEL.BROADCAST.GO_LIVE_NOW'
			: 'PANEL.BROADCAST.RETRY_DESTINATION';
	});

	/**
	 * Keeps the editor of a destination added while live open until the server answers: it closes
	 * once the broadcast is in, and a refusal shows under the URL instead of as a failure of the
	 * meeting's broadcasts, which go on streaming.
	 */
	private readonly addedDestinationEffect = effect(() => {
		const added = this.addingDestination();

		if (!added || this.pendingRequests().some((request) => startsMeetingDestination(request, added.url))) return;

		this.addingDestination.set(undefined);
		const refusal = this.broadcastState.refusal();

		if (refusal && startsMeetingDestination(refusal.request, added.url)) {
			this.removeMeetingDestination(added.id);
			this.editor.rejection.set(refusal.error ?? '');
			this.broadcastState.dismissFailure();
		} else {
			this.closeEditor();
		}
	});

	private readonly roomTracksPublishedEffect = effect(() => {
		this.participantService.localParticipant();
		this.participantService.remoteParticipants();
		this.hasRoomTracksPublished.set(this.meetingLiveKitService.hasRoomTracksPublished());
	});

	platformOf(url: string) {
		return detectBroadcastPlatform(url);
	}

	hostOf(url: string): string {
		return extractBroadcastHost(url);
	}

	statusKeyOf(row: DestinationRow): string {
		return ROW_STATUS_KEYS[row.status];
	}

	/** Whether the row's broadcast can be stopped, and no stop of it is on its way. */
	isStreaming(row: DestinationRow): boolean {
		return !!row.broadcast && isBroadcastRunning(row.broadcast.status) && row.status !== 'stopping';
	}

	toggleSelected(key: string, selected: boolean): void {
		this.unselectedIds.update((ids) => {
			const next = new Set(ids);

			if (selected) {
				next.delete(key);
			} else {
				next.add(key);
			}

			return next;
		});
	}

	openAdd(): void {
		this.editor.open();
		this.editorOpen.set(true);
	}

	closeEditor(): void {
		this.addingDestination.set(undefined);
		this.editorOpen.set(false);
	}

	submitEditor(): void {
		const draft = this.editor.submit();

		if (!draft) return;

		const destination = { ...draft, id: `meeting-${++this.meetingDestinationCount}` };
		this.meetingDestinations.update((destinations) => [...destinations, destination]);

		if (this.isRunning()) {
			this.addingDestination.set(destination);
			this.startTo([draft]);
			return;
		}

		this.closeEditor();
	}

	removeMeetingDestination(id: string): void {
		this.meetingDestinations.update((destinations) => destinations.filter((destination) => destination.id !== id));
	}

	/** Streams to every chosen destination not streamed to yet, one broadcast each. */
	goLive(): void {
		this.startTo(
			this.rows()
				.filter(({ selected, status, start }) => selected && status === 'stopped' && start)
				.map(({ start }) => start!)
		);
	}

	stop(): void {
		this.emitRequest({ action: 'stop' });
	}

	startRow(row: DestinationRow): void {
		if (row.start) this.startTo([row.start]);
	}

	stopRow(row: DestinationRow): void {
		if (row.broadcast) this.emitRequest({ action: 'stop', broadcastIds: [row.broadcast.broadcastId] });
	}

	/** Clears the failures and goes live again to the chosen destinations. */
	retry(): void {
		this.dismissFailure();
		this.goLive();
	}

	dismissFailure(): void {
		this.broadcastState.dismissFailure();
	}

	/** Starts these destinations alone: the room destinations not named are left as they are. */
	private startTo(starts: DestinationStart[]): void {
		const destinationIds = starts.flatMap((start) => ('destinationId' in start ? [start.destinationId] : []));
		const destinations = starts.flatMap((start) => ('destinationId' in start ? [] : [start]));
		this.emitRequest({ action: 'start', destinationIds, destinations });
	}

	/**
	 * How the row is doing: as its broadcast goes, unless a request the server has not answered yet
	 * stops that broadcast, or starts the destination while nothing streams to it.
	 */
	private toRow(row: Omit<DestinationRow, 'status'>): DestinationRow {
		const { broadcast, start } = row;
		const pending = this.pendingRequests();
		const startsRow = (request: BroadcastRequestedEvent) =>
			!!start &&
			('destinationId' in start
				? startsRoomDestination(request, start.destinationId)
				: startsMeetingDestination(request, start.url));
		let status: RowStatus;

		if (
			broadcast &&
			isBroadcastRunning(broadcast.status) &&
			pending.some((request) => stopsBroadcast(request, broadcast.broadcastId))
		) {
			status = 'stopping';
		} else if ((!broadcast || !isBroadcastInProgress(broadcast.status)) && pending.some(startsRow)) {
			status = 'connecting';
		} else {
			status = broadcast ? ROW_STATUS_BY_BROADCAST[broadcast.status] : 'stopped';
		}

		return { ...row, status };
	}

	private emitRequest(request: BroadcastRequest): void {
		this.onBroadcastRequested.emit({ ...request, roomId: this.meetingLiveKitService.getRoomName() });
	}
}
