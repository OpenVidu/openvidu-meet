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
	isBroadcastRunning
} from '../../../../models/broadcast.model';
import { TranslatePipe } from '../../../../pipes/translate.pipe';
import { BroadcastStateService } from '../../../../services/broadcast/broadcast-state.service';
import { MeetingUiConfigService } from '../../../../services/config/meeting-ui-config.service';
import { MeetingLiveKitService } from '../../../../services/meeting-livekit/meeting-livekit.service';
import { ParticipantService } from '../../../../services/participant/participant.service';
import { ActivityItemComponent, ActivityState } from '../activity-item/activity-item.component';

/** How a destination row is doing, from the broadcast to it or from what was just asked. */
type RowStatus = 'connecting' | 'live' | 'stopping' | 'stopped' | 'failed';

/**
 * A destination as the activity lists it: one of the room's, or one given for this meeting, with
 * the broadcast to it when there is one.
 */
interface DestinationRow {
	/** The room destination's id, or the redacted URL of a destination given for the meeting */
	key: string;
	name: string;
	url: string;
	source: 'room' | 'meeting';
	broadcast?: MeetBroadcastInfo;
	/** How to start a broadcast to it; absent when this client does not know the full URL */
	start?: MeetBroadcastStartDestination;
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
	private readonly pendingRequest = this.broadcastState.request;
	private readonly showAddDestinations = this.uiConfig.broadcastActivityAddDestinationsSignal;

	/** A refusal of what was last asked, shown until dismissed; one of a destination being added shows in its editor. */
	readonly requestError = computed(() =>
		this.pendingRequest().status === 'failed' && !this.addingDestination()
			? (this.pendingRequest().error ?? '')
			: undefined
	);
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

	readonly streamingCount = this.broadcastState.streamingDestinationCount;
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
	private readonly meetingDestinations = signal<BroadcastDestinationDraft[]>([]);
	/** The destinations a start was asked for and the server has not reported yet. */
	private readonly pendingKeys = signal(new Set<string>());

	readonly rows = computed<DestinationRow[]>(() => {
		const broadcasts = this.broadcastState.broadcasts();
		const meetingBroadcasts = broadcasts.filter(({ destinationId }) => !destinationId);
		const local = this.meetingDestinations();

		return [
			...this.roomDestinations().map(({ id, name, url }) =>
				this.toRow({
					key: id!,
					name,
					url,
					source: 'room',
					broadcast: broadcasts.find(({ destinationId }) => destinationId === id),
					start: { destinationId: id },
					selected: !this.unselectedIds().has(id!)
				})
			),
			...meetingBroadcasts.map((broadcast) => {
				const own = local.find(({ url }) => redactStreamUrl(url) === broadcast.url);
				return this.toRow({
					key: broadcast.url,
					name: broadcast.name,
					url: broadcast.url,
					source: 'meeting',
					broadcast,
					start: own && { name: own.name, url: own.url },
					selected: true
				});
			}),
			...local
				.filter(({ url }) => !meetingBroadcasts.some((broadcast) => broadcast.url === redactStreamUrl(url)))
				.map(({ name, url }) =>
					this.toRow({
						key: redactStreamUrl(url),
						name,
						url,
						source: 'meeting',
						start: { name, url },
						selected: true
					})
				)
		];
	});
	readonly selectedCount = computed(() => this.rows().filter(({ selected }) => selected).length);
	readonly plannedMbps = computed(() => broadcastUploadMbps(this.selectedCount()));
	readonly canAddDestination = computed(() => {
		const count = this.isRunning() ? this.streamingCount() : this.selectedCount();
		return this.showAddDestinations() && !this.editorOpen() && count < this.maxDestinations;
	});

	readonly hasRoomTracksPublished = signal(false);
	readonly canGoLive = computed(
		() => this.selectedCount() > 0 && this.hasRoomTracksPublished() && this.pendingRequest().status !== 'starting'
	);

	readonly editor = new DestinationEditor(this.formBuilder);
	readonly editorOpen = signal(false);
	/** A destination given for the meeting while live, whose start the server has not answered yet. */
	readonly addingDestination = signal(false);
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
		const request = this.pendingRequest();

		if (!this.addingDestination() || request.status === 'starting') return;

		this.addingDestination.set(false);

		if (request.status === 'failed') {
			const { url } = this.editor.form.getRawValue();
			this.meetingDestinations.update((destinations) =>
				destinations.filter((destination) => destination.url !== url.trim())
			);
			this.editor.rejection.set(request.error ?? '');
			this.broadcastState.dismissFailure();
		} else {
			this.closeEditor();
		}
	});

	/** Nothing is pending once the server has answered every start asked for. */
	private readonly pendingEffect = effect(() => {
		if (this.pendingRequest().status !== 'starting') {
			this.pendingKeys.set(new Set());
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

	/** Whether the row's broadcast can be stopped. */
	isStreaming(row: DestinationRow): boolean {
		return !!row.broadcast && isBroadcastRunning(row.broadcast.status);
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
		this.addingDestination.set(false);
		this.editorOpen.set(false);
	}

	submitEditor(): void {
		const destination = this.editor.submit();

		if (!destination) return;

		this.meetingDestinations.update((destinations) => [...destinations, destination]);

		if (this.isRunning()) {
			this.addingDestination.set(true);
			this.startTo([destination], [redactStreamUrl(destination.url)]);
			return;
		}

		this.closeEditor();
	}

	removeMeetingDestination(key: string): void {
		this.meetingDestinations.update((destinations) =>
			destinations.filter(({ url }) => redactStreamUrl(url) !== key)
		);
	}

	/** Streams to every chosen destination not streamed to yet, one broadcast each. */
	goLive(): void {
		const rows = this.rows().filter(({ selected, broadcast, start }) => selected && !broadcast && start);
		this.startTo(
			rows.map(({ start }) => start!),
			rows.map(({ key }) => key)
		);
	}

	stop(): void {
		this.emitRequest({ action: 'stop' });
	}

	startRow(row: DestinationRow): void {
		if (row.start) this.startTo([row.start], [row.key]);
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
		this.pendingKeys.set(new Set());
	}

	private startTo(destinations: MeetBroadcastStartDestination[], keys: string[]): void {
		this.pendingKeys.update((pending) => new Set([...pending, ...keys]));
		this.emitRequest({ action: 'start', destinations });
	}

	private toRow(row: Omit<DestinationRow, 'status'>): DestinationRow {
		const status = row.broadcast
			? ROW_STATUS_BY_BROADCAST[row.broadcast.status]
			: this.pendingKeys().has(row.key)
				? 'connecting'
				: 'stopped';
		return { ...row, status };
	}

	private emitRequest(request: BroadcastRequest): void {
		this.onBroadcastRequested.emit({ ...request, roomId: this.meetingLiveKitService.getRoomName() });
	}
}
