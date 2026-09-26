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
	MeetBroadcastDestinationInfo,
	MeetBroadcastDestinationStatus,
	MeetBroadcastStartDestination
} from '@openvidu-meet/typings';
import { PlatformIconComponent } from '../../../../../../../shared/components/platform-icon/platform-icon.component';
import { BROADCAST_MBPS_PER_DESTINATION } from '../../../../../../../shared/models/broadcast.model';
import {
	BROADCAST_PLATFORM_LABELS,
	detectBroadcastPlatform,
	extractBroadcastHost
} from '../../../../../../../shared/utils/broadcast-platform.utils';
import { MeetingContextService } from '../../../../../services/meeting-context.service';
import { BroadcastRequestedEvent } from '../../../../models/broadcast.model';
import { TranslatePipe } from '../../../../pipes/translate.pipe';
import { BroadcastStateService } from '../../../../services/broadcast/broadcast-state.service';
import { MeetingUiConfigService } from '../../../../services/config/meeting-ui-config.service';
import { MeetingLiveKitService } from '../../../../services/meeting-livekit/meeting-livekit.service';
import { ParticipantService } from '../../../../services/participant/participant.service';

type BroadcastPhase = 'idle' | 'starting' | 'live' | 'ending' | 'failed';

/** A destination as the activity offers it before going live: the room's, possibly changed for this meeting, or added for it. */
interface PlannedDestination {
	id: string;
	name: string;
	url: string;
	source: 'room' | 'meeting';
	selected: boolean;
	edited: boolean;
}

/** Which destination the inline editor is for: a new one, or the planned one with that id. */
type EditorTarget = { id: string } | 'new' | null;

/** A request as the activity builds it, before the room id every one of them carries is added. */
type BroadcastRequest = BroadcastRequestedEvent extends infer Event
	? Event extends BroadcastRequestedEvent
		? Omit<Event, 'roomId'>
		: never
	: never;

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
	private readonly libService = inject(MeetingUiConfigService);
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

	readonly broadcast = this.broadcastState.broadcast;
	readonly request = this.broadcastState.request;
	readonly elapsed = this.broadcastState.elapsed;
	readonly showControls = this.libService.broadcastActivityControlsSignal;
	readonly showAddDestinations = this.libService.broadcastActivityAddDestinationsSignal;
	readonly showEditDestinations = this.libService.broadcastActivityEditDestinationsSignal;

	readonly phase = computed<BroadcastPhase>(() => {
		if (this.broadcastState.hasFailed() || this.request().status === 'failed') return 'failed';

		if (this.broadcastState.isEnding()) return 'ending';

		if (this.broadcastState.isLive()) return 'live';

		return this.broadcastState.isStarting() ? 'starting' : 'idle';
	});
	readonly statusKey = computed(() => STATUS_KEYS[this.phase()]);
	readonly isRunning = computed(() => this.phase() === 'starting' || this.phase() === 'live');

	/** The broadcast's destinations while it runs, or those of the failed attempt. */
	readonly liveDestinations = computed(() => this.broadcast()?.destinations ?? []);
	readonly liveCount = this.broadcastState.streamingDestinationCount;
	readonly failedCount = computed(
		() => this.liveDestinations().filter(({ status }) => status === MeetBroadcastDestinationStatus.FAILED).length
	);
	readonly liveMbps = computed(() => this.liveCount() * this.mbpsPerDestination);
	readonly failure = computed(() => this.request().error ?? this.broadcast()?.error ?? this.broadcast()?.details);

	// Before going live: the room's destinations, all chosen unless unticked, with the changes and
	// additions made for this meeting.
	private readonly roomDestinations = computed(() => this.meetingContext.broadcastConfig()?.destinations ?? []);
	private readonly unselectedIds = signal(new Set<string>());
	private readonly edits = signal(new Map<string, { name: string; url: string }>());
	private readonly extras = signal<{ id: string; name: string; url: string }[]>([]);
	private nextExtraId = 0;

	readonly planned = computed<PlannedDestination[]>(() => [
		...this.roomDestinations().map((destination) => {
			const edit = this.edits().get(destination.id!);
			return {
				id: destination.id!,
				name: edit?.name ?? destination.name,
				url: edit?.url ?? destination.url,
				source: 'room' as const,
				selected: !this.unselectedIds().has(destination.id!),
				edited: edit !== undefined
			};
		}),
		...this.extras().map((extra) => ({ ...extra, source: 'meeting' as const, selected: true, edited: false }))
	]);
	readonly selectedCount = computed(() => this.planned().filter(({ selected }) => selected).length);
	readonly plannedMbps = computed(() => this.selectedCount() * this.mbpsPerDestination);
	readonly canAddDestination = computed(() => {
		const count = this.isRunning() ? this.liveDestinations().length : this.planned().length;
		return this.showAddDestinations() && this.editor() === null && count < this.maxDestinations;
	});

	readonly hasRoomTracksPublished = signal(false);
	readonly canGoLive = computed(
		() => this.selectedCount() > 0 && this.hasRoomTracksPublished() && this.request().status !== 'starting'
	);

	readonly editor = signal<EditorTarget>(null);
	readonly destinationForm = this.formBuilder.nonNullable.group({
		name: ['', [Validators.required, Validators.maxLength(50)]],
		url: ['', [Validators.required, rtmpUrlValidator]]
	});
	private readonly editedUrl = toSignal(this.destinationForm.controls.url.valueChanges, { initialValue: '' });
	readonly detectedPlatform = computed(() => detectBroadcastPlatform(this.editedUrl()));
	readonly detectedPlatformLabel = computed(() => BROADCAST_PLATFORM_LABELS[this.detectedPlatform()]);
	readonly editingName = computed(() => {
		const target = this.editor();
		return target && target !== 'new' ? (this.planned().find(({ id }) => id === target.id)?.name ?? '') : '';
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

	isStreaming(destination: MeetBroadcastDestinationInfo): boolean {
		return (
			destination.status === MeetBroadcastDestinationStatus.CONNECTING ||
			destination.status === MeetBroadcastDestinationStatus.ACTIVE
		);
	}

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
		this.destinationForm.reset({ name: '', url: '' });
		this.editor.set('new');
	}

	openEdit(destination: PlannedDestination): void {
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
			this.emit({ action: 'addDestination', broadcastId: this.broadcast()!.broadcastId, destination });
		} else if (target === 'new') {
			this.extras.update((extras) => [...extras, { id: `meeting-${this.nextExtraId++}`, ...destination }]);
		} else if (target) {
			this.setEdit(target.id, destination);
		}

		this.closeEditor();
	}

	removeExtra(id: string): void {
		this.extras.update((extras) => extras.filter((extra) => extra.id !== id));
	}

	goLive(): void {
		const planned = this.planned();
		const unchanged = planned.every(({ source, selected, edited }) => source === 'room' && selected && !edited);
		const destinations: MeetBroadcastStartDestination[] = planned
			.filter(({ selected }) => selected)
			.map(({ id, name, url, source, edited }) =>
				source === 'meeting' ? { name, url } : edited ? { id, name, url } : { id }
			);

		this.emit({ action: 'start', destinations: unchanged ? undefined : destinations });
	}

	stop(): void {
		this.emit({ action: 'stop', broadcastId: this.broadcast()!.broadcastId });
	}

	setDestinationActive(destination: MeetBroadcastDestinationInfo, active: boolean): void {
		this.emit({
			action: 'updateDestination',
			broadcastId: this.broadcast()!.broadcastId,
			destinationId: destination.id,
			active
		});
	}

	/**
	 * Clears the failure and asks again for what failed: a start that never made it is asked for
	 * again, while a running broadcast whose request failed just goes on.
	 */
	retry(): void {
		const wasRunning = this.isRunningBroadcast();
		this.dismissFailure();

		if (!wasRunning) {
			this.goLive();
		}
	}

	dismissFailure(): void {
		this.broadcastState.dismissFailure();
	}

	private isRunningBroadcast(): boolean {
		const status = this.broadcast()?.status;
		return status === 'starting' || status === 'active';
	}

	private setEdit(id: string, edit: { name: string; url: string }): void {
		const saved = this.roomDestinations().find((destination) => destination.id === id);
		this.edits.update((edits) => {
			const next = new Map(edits);

			if (saved && saved.name === edit.name && saved.url === edit.url) {
				next.delete(id);
			} else {
				next.set(id, edit);
			}

			return next;
		});
	}

	private emit(request: BroadcastRequest): void {
		this.onBroadcastRequested.emit({ ...request, roomId: this.meetingLiveKitService.getRoomName() });
	}
}
