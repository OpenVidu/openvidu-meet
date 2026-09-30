import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
	MEET_BROADCAST_MAX_DESTINATIONS,
	MEET_BROADCAST_DESTINATION_NAME_MAX_LENGTH,
	MeetBroadcastDestinationInfo,
	MeetBroadcastDestinationOptions,
	MeetBroadcastDestinationSource,
	MeetBroadcastDestinationStatus,
	MeetBroadcastStartDestination
} from '@openvidu-meet/typings';
import { PlatformIconComponent } from '../../../../../../../shared/components/platform-icon/platform-icon.component';
import {
	BROADCAST_MBPS_PER_DESTINATION,
	BROADCAST_PLATFORM_LABELS,
	broadcastUploadMbps
} from '../../../../../../../shared/models/broadcast.model';
import {
	detectBroadcastPlatform,
	extractBroadcastHost,
	servedUrlValidator
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

const DESTINATION_STATUS_KEYS: Record<MeetBroadcastDestinationStatus, string> = {
	[MeetBroadcastDestinationStatus.CONNECTING]: 'PANEL.BROADCAST.DEST_CONNECTING',
	[MeetBroadcastDestinationStatus.ACTIVE]: 'PANEL.BROADCAST.DEST_LIVE',
	[MeetBroadcastDestinationStatus.STOPPED]: 'PANEL.BROADCAST.DEST_STOPPED',
	[MeetBroadcastDestinationStatus.FAILED]: 'PANEL.BROADCAST.DEST_FAILED'
};

const rtmpUrlValidator = (control: AbstractControl<string>): ValidationErrors | null => {
	const value = control.value.trim();

	if (!value) return null;

	try {
		const { protocol } = new URL(value);
		return protocol === 'rtmp:' || protocol === 'rtmps:' ? null : { rtmpUrl: true };
	} catch {
		return { rtmpUrl: true };
	}
};

/**
 * The **BroadcastActivityComponent** shows the live broadcast of the meeting: where it streams,
 * how each destination is doing, and the controls to go live, stop, and change destinations for
 * this meeting.
 */
@Component({
	selector: 'ov-broadcast-activity',
	imports: [
		DatePipe,
		NgTemplateOutlet,
		ReactiveFormsModule,
		MatButtonModule,
		MatCheckboxModule,
		MatExpansionModule,
		MatFormFieldModule,
		MatIconModule,
		MatInputModule,
		MatTooltipModule,
		PlatformIconComponent,
		TranslatePipe
	],
	templateUrl: './broadcast-activity.component.html',
	styleUrls: ['./broadcast-activity.component.scss', '../activities-panel.component.scss']
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

	/**
	 * @internal
	 */
	readonly isPanelOpened = signal(false);

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
		if (this.broadcastState.hasFailed() || this.pendingRequest().status === 'failed') return 'failed';

		if (this.broadcastState.isEnding()) return 'ending';

		if (this.broadcastState.isLive()) return 'live';

		return this.broadcastState.isStarting() ? 'starting' : 'idle';
	});
	readonly statusKey = computed(() => STATUS_KEYS[this.phase()]);
	readonly isRunning = computed(() => this.phase() === 'starting' || this.phase() === 'live');

	/** The broadcast's destinations while it runs, or those of the failed attempt. */
	readonly broadcastDestinations = computed(() => this.broadcast()?.destinations ?? []);
	readonly streamingCount = this.broadcastState.streamingDestinationCount;
	readonly failedCount = computed(
		() =>
			this.broadcastDestinations().filter(({ status }) => status === MeetBroadcastDestinationStatus.FAILED).length
	);
	readonly liveMbps = computed(() => broadcastUploadMbps(this.streamingCount()));
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
		return this.showAddDestinations() && this.editor() === null && count < this.maxDestinations;
	});

	readonly hasRoomTracksPublished = signal(false);
	readonly canGoLive = computed(
		() => this.selectedCount() > 0 && this.hasRoomTracksPublished() && this.pendingRequest().status !== 'starting'
	);

	protected readonly nameMaxLength = MEET_BROADCAST_DESTINATION_NAME_MAX_LENGTH;
	readonly editor = signal<EditorTarget>(null);
	readonly destinationForm = this.formBuilder.nonNullable.group({
		name: ['', [Validators.required, Validators.maxLength(MEET_BROADCAST_DESTINATION_NAME_MAX_LENGTH)]],
		url: ['', [Validators.required, rtmpUrlValidator, servedUrlValidator(() => this.servedUrl())]]
	});
	/** The URL the room destination being edited was saved with, as the room serves it: redacted. */
	private readonly servedUrl = signal<string | undefined>(undefined);
	private readonly editedUrl = toSignal(this.destinationForm.controls.url.valueChanges, { initialValue: '' });
	readonly detectedPlatform = computed(() => detectBroadcastPlatform(this.editedUrl()));
	readonly detectedPlatformLabel = computed(() => BROADCAST_PLATFORM_LABELS[this.detectedPlatform()]);
	readonly editedDestinationName = computed(() => {
		const target = this.editor();
		return target && target !== 'new'
			? (this.plannedDestinations().find(({ id }) => id === target.id)?.name ?? '')
			: '';
	});

	private readonly roomTracksPublishedEffect = effect(() => {
		this.participantService.localParticipant();
		this.participantService.remoteParticipants();
		this.hasRoomTracksPublished.set(this.meetingLiveKitService.hasRoomTracksPublished());
	});

	/**
	 * @internal
	 */
	setPanelOpened(value: boolean) {
		this.isPanelOpened.set(value);
	}

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
		this.servedUrl.set(undefined);
		this.destinationForm.reset({ name: '', url: '' });
		this.editor.set('new');
	}

	openEdit(destination: PlannedDestination): void {
		this.servedUrl.set(this.roomDestinations().find(({ id }) => id === destination.id)?.url);
		this.destinationForm.reset({ name: destination.name, url: destination.url });
		this.editor.set({ id: destination.id });
	}

	closeEditor(): void {
		this.editor.set(null);
	}

	submitEditor(): void {
		if (this.destinationForm.invalid) {
			this.destinationForm.markAllAsTouched();
			return;
		}

		const target = this.editor();
		const { name, url } = this.destinationForm.getRawValue();
		const destination = { name: name.trim(), url: url.trim() };

		if (target === 'new' && this.isRunning()) {
			this.emitRequest({ action: 'addDestination', broadcastId: this.broadcast()!.broadcastId, destination });
		} else if (target === 'new') {
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
