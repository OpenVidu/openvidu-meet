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
	MeetBroadcastDestinationInfo,
	MeetBroadcastDestinationOptions,
	MeetBroadcastDestinationSource,
	MeetBroadcastDestinationStatus,
	MeetBroadcastStartDestination
} from '@openvidu-meet/typings';
import { PlatformIconComponent } from '../../../../../../../shared/components/platform-icon/platform-icon.component';
import {
	BROADCAST_MBPS_PER_DESTINATION,
	broadcastUploadMbps
} from '../../../../../../../shared/models/broadcast.model';
import { DestinationEditor } from '../../../../../../../shared/utils/broadcast-destination-editor';
import {
	detectBroadcastPlatform,
	extractBroadcastHost
} from '../../../../../../../shared/utils/broadcast-platform.utils';
import { MeetingContextService } from '../../../../../services/meeting-context.service';
import {
	BroadcastPhase,
	BroadcastRequest,
	BroadcastRequestedEvent,
	isBroadcastRunning,
	isDestinationStreaming
} from '../../../../models/broadcast.model';
import { TranslatePipe } from '../../../../pipes/translate.pipe';
import { BroadcastStateService } from '../../../../services/broadcast/broadcast-state.service';
import { MeetingUiConfigService } from '../../../../services/config/meeting-ui-config.service';
import { MeetingLiveKitService } from '../../../../services/meeting-livekit/meeting-livekit.service';
import { ParticipantService } from '../../../../services/participant/participant.service';
import { ActivityItemComponent, ActivityState } from '../activity-item/activity-item.component';

/** A destination as the activity offers it before going live: the room's, possibly changed for this meeting, or added for it. */
interface PlannedDestination extends MeetBroadcastDestinationOptions {
	id: string;
	source: MeetBroadcastDestinationSource;
	selected: boolean;
	edited: boolean;
}

/** Which destination the inline editor is for: a new one, or the planned one with that id. */
type EditorTarget = { id: string } | 'new' | null;

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

const DESTINATION_STATUS_KEYS: Record<MeetBroadcastDestinationStatus, string> = {
	[MeetBroadcastDestinationStatus.CONNECTING]: 'PANEL.BROADCAST.DEST_CONNECTING',
	[MeetBroadcastDestinationStatus.ACTIVE]: 'PANEL.BROADCAST.DEST_LIVE',
	[MeetBroadcastDestinationStatus.STOPPED]: 'PANEL.BROADCAST.DEST_STOPPED',
	[MeetBroadcastDestinationStatus.FAILED]: 'PANEL.BROADCAST.DEST_FAILED'
};

/**
 * The **BroadcastActivityComponent** shows the live broadcast of the meeting: where it streams,
 * how each destination is doing, and the controls to go live, stop, and change destinations for
 * this meeting.
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
	 * Fired whenever the user asks something of the broadcast: going live, stopping it, adding a
	 * destination or starting and stopping one. See {@link BroadcastRequestedEvent}.
	 */
	onBroadcastRequested = output<BroadcastRequestedEvent>();

	readonly maxDestinations = MEET_BROADCAST_MAX_DESTINATIONS;
	readonly mbpsPerDestination = BROADCAST_MBPS_PER_DESTINATION;
	readonly destinationStatus = MeetBroadcastDestinationStatus;
	readonly destinationSource = MeetBroadcastDestinationSource;

	readonly broadcast = this.broadcastState.broadcast;
	readonly elapsed = this.broadcastState.elapsed;
	readonly showControls = this.uiConfig.broadcastActivityControlsSignal;
	readonly showEditDestinations = this.uiConfig.broadcastActivityEditDestinationsSignal;
	private readonly pendingRequest = this.broadcastState.request;
	private readonly showAddDestinations = this.uiConfig.broadcastActivityAddDestinationsSignal;

	readonly phase = computed<BroadcastPhase>(() => {
		const requestFailed = this.pendingRequest().status === 'failed' && !this.addingDestination();

		if (this.broadcastState.hasFailed() || requestFailed) return 'failed';

		if (this.broadcastState.isEnding()) return 'ending';

		if (this.broadcastState.isLive()) return 'live';

		return this.broadcastState.isStarting() ? 'starting' : 'idle';
	});
	readonly statusKey = computed(() => STATUS_KEYS[this.phase()]);
	readonly state = computed<ActivityState>(() => ACTIVITY_STATES[this.phase()]);
	readonly isRunning = computed(() => this.phase() === 'starting' || this.phase() === 'live');

	/** The broadcast's destinations while it runs, or those of the failed attempt. */
	readonly broadcastDestinations = computed(() => this.broadcast()?.destinations ?? []);
	readonly streamingCount = this.broadcastState.streamingDestinationCount;
	readonly liveCount = this.broadcastState.liveDestinationCount;
	readonly failedCount = computed(
		() =>
			this.broadcastDestinations().filter(({ status }) => status === MeetBroadcastDestinationStatus.FAILED).length
	);
	readonly liveMbps = computed(() => broadcastUploadMbps(this.liveCount()));
	readonly failure = computed(
		() => this.pendingRequest().error ?? this.broadcast()?.error ?? this.broadcast()?.details
	);

	// Before going live: the room's destinations, all chosen unless unticked, with the changes and
	// additions made for this meeting.
	private readonly roomDestinations = computed(() => this.meetingContext.broadcastConfig()?.destinations ?? []);
	private readonly unselectedIds = signal(new Set<string>());
	private readonly roomDestinationEdits = signal(new Map<string, MeetBroadcastDestinationOptions>());
	private readonly meetingDestinations = signal<({ id: string } & MeetBroadcastDestinationOptions)[]>([]);
	private nextMeetingDestinationId = 0;

	readonly plannedDestinations = computed<PlannedDestination[]>(() => [
		...this.roomDestinations().map((destination) => {
			const edit = this.roomDestinationEdits().get(destination.id!);
			return {
				id: destination.id!,
				name: edit?.name ?? destination.name,
				url: edit?.url ?? destination.url,
				source: MeetBroadcastDestinationSource.ROOM,
				selected: !this.unselectedIds().has(destination.id!),
				edited: edit !== undefined
			};
		}),
		...this.meetingDestinations().map((destination) => ({
			...destination,
			source: MeetBroadcastDestinationSource.MEETING,
			selected: true,
			edited: false
		}))
	]);
	readonly selectedCount = computed(() => this.plannedDestinations().filter(({ selected }) => selected).length);
	readonly plannedMbps = computed(() => broadcastUploadMbps(this.selectedCount()));
	readonly canAddDestination = computed(() => {
		const count = this.isRunning() ? this.broadcastDestinations().length : this.plannedDestinations().length;
		return this.showAddDestinations() && this.editorTarget() === null && count < this.maxDestinations;
	});

	readonly hasRoomTracksPublished = signal(false);
	readonly canGoLive = computed(
		() => this.selectedCount() > 0 && this.hasRoomTracksPublished() && this.pendingRequest().status !== 'starting'
	);

	readonly editor = new DestinationEditor(this.formBuilder);
	readonly editorTarget = signal<EditorTarget>(null);
	/** A destination added to the running broadcast that the server has not answered yet. */
	readonly addingDestination = signal(false);
	readonly editedDestinationName = computed(() => {
		const target = this.editorTarget();
		return target && target !== 'new'
			? (this.plannedDestinations().find(({ id }) => id === target.id)?.name ?? '')
			: '';
	});

	/**
	 * Keeps the editor of a destination added to the running broadcast open until the server
	 * answers: it closes once the destination is in, and a refusal shows under the URL instead of
	 * as a failure of the broadcast, which goes on streaming.
	 */
	private readonly addedDestinationEffect = effect(() => {
		const request = this.pendingRequest();

		if (!this.addingDestination() || request.status === 'updating') return;

		this.addingDestination.set(false);

		if (request.status === 'failed') {
			this.editor.rejectUrl(request.error ?? '');
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

	statusKeyOf(destination: MeetBroadcastDestinationInfo): string {
		return DESTINATION_STATUS_KEYS[destination.status];
	}

	readonly isStreaming = isDestinationStreaming;

	toggleSelected(id: string, selected: boolean): void {
		this.unselectedIds.update((ids) => {
			const next = new Set(ids);

			if (selected) {
				next.delete(id);
			} else {
				next.add(id);
			}

			return next;
		});
	}

	openAdd(): void {
		this.editor.open();
		this.editorTarget.set('new');
	}

	openEdit(destination: PlannedDestination): void {
		const saved = this.roomDestinations().find(({ id }) => id === destination.id);
		this.editor.open({ name: destination.name, url: destination.url }, saved?.url);
		this.editorTarget.set({ id: destination.id });
	}

	closeEditor(): void {
		this.addingDestination.set(false);
		this.editorTarget.set(null);
	}

	isEditingDestination(id: string): boolean {
		const target = this.editorTarget();
		return target !== null && target !== 'new' && target.id === id;
	}

	submitEditor(): void {
		const target = this.editorTarget();
		const destination = this.editor.submit();

		if (!destination) return;

		if (target === 'new' && this.isRunning()) {
			this.addingDestination.set(true);
			this.emitRequest({ action: 'addDestination', broadcastId: this.broadcast()!.broadcastId, destination });
			return;
		}

		if (target === 'new') {
			this.meetingDestinations.update((destinations) => [
				...destinations,
				{ id: `meeting-${this.nextMeetingDestinationId++}`, ...destination }
			]);
		} else if (target) {
			this.applyRoomDestinationEdit(target.id, destination);
		}

		this.closeEditor();
	}

	removeMeetingDestination(id: string): void {
		this.meetingDestinations.update((destinations) => destinations.filter((destination) => destination.id !== id));
	}

	goLive(): void {
		const planned = this.plannedDestinations();
		const unchanged = planned.every(
			({ source, selected, edited }) => source === MeetBroadcastDestinationSource.ROOM && selected && !edited
		);
		const destinations: MeetBroadcastStartDestination[] = planned
			.filter(({ selected }) => selected)
			.map(({ id, name, url, source, edited }) =>
				source === MeetBroadcastDestinationSource.MEETING ? { name, url } : edited ? { id, name, url } : { id }
			);

		this.emitRequest({ action: 'start', destinations: unchanged ? undefined : destinations });
	}

	stop(): void {
		this.emitRequest({ action: 'stop', broadcastId: this.broadcast()!.broadcastId });
	}

	startDestination(destination: MeetBroadcastDestinationInfo): void {
		this.setDestinationActive(destination, true);
	}

	stopDestination(destination: MeetBroadcastDestinationInfo): void {
		this.setDestinationActive(destination, false);
	}

	/**
	 * Clears the failure and asks again for what failed: a start that never made it is asked for
	 * again, while a running broadcast whose request failed just goes on.
	 */
	retry(): void {
		const wasRunning = this.isBroadcastRunningOnServer();
		this.dismissFailure();

		if (!wasRunning) {
			this.goLive();
		}
	}

	dismissFailure(): void {
		this.broadcastState.dismissFailure();
	}

	private isBroadcastRunningOnServer(): boolean {
		const status = this.broadcast()?.status;
		return status !== undefined && isBroadcastRunning(status);
	}

	private setDestinationActive(destination: MeetBroadcastDestinationInfo, active: boolean): void {
		this.emitRequest({
			action: 'updateDestination',
			broadcastId: this.broadcast()!.broadcastId,
			destinationId: destination.id,
			active
		});
	}

	private applyRoomDestinationEdit(id: string, edit: MeetBroadcastDestinationOptions): void {
		const saved = this.roomDestinations().find((destination) => destination.id === id);
		this.roomDestinationEdits.update((edits) => {
			const next = new Map(edits);

			if (saved && saved.name === edit.name && saved.url === edit.url) {
				next.delete(id);
			} else {
				next.set(id, edit);
			}

			return next;
		});
	}

	private emitRequest(request: BroadcastRequest): void {
		this.onBroadcastRequested.emit({ ...request, roomId: this.meetingLiveKitService.getRoomName() });
	}
}
