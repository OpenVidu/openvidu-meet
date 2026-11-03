import { DatePipe } from '@angular/common';
import { Component, computed, ElementRef, inject, OnDestroy, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MeetingContextService } from '../../../services/meeting-context.service';
import { MeetingReactionsService } from '../../../services/meeting-reactions.service';
import { PanelActivitiesOptions, PanelType } from '../../models/panel.model';
import { REACTION_EMOJI } from '../../models/reaction.model';
import { RecordingState } from '../../models/recording.model';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { BroadcastStateService } from '../../services/broadcast/broadcast-state.service';
import { MeetingUiConfigService } from '../../services/config/meeting-ui-config.service';
import { SmartLayoutService } from '../../services/layout/smart-layout.service';
import { MeetingEndingSoonService } from '../../services/meeting-ending-soon/meeting-ending-soon.service';
import { PanelService } from '../../services/panel/panel.service';
import { ParticipantService } from '../../services/participant/participant.service';
import { RecordingService } from '../../services/recording/recording.service';
import { HiddenParticipantsIndicatorComponent } from '../hidden-participants-indicator/hidden-participants-indicator.component';

/**
 * The meeting-wide status above the layout, with the reactions in the middle of the row. When its
 * chips do not fit in one row, a phone moves what the participants do to a second one.
 */
@Component({
	selector: 'ov-status-rail',
	imports: [DatePipe, MatIconModule, MatTooltipModule, TranslatePipe, HiddenParticipantsIndicatorComponent],
	templateUrl: './status-rail.component.html',
	styleUrl: './status-rail.component.scss',
	host: {
		'[class.has-status]': 'hasStatus()',
		'[class.needs-second-row]': 'needsSecondRow()'
	}
})
export class StatusRailComponent implements OnDestroy {
	private static readonly ENDING_SOON_URGENT_MS = 60_000;

	private readonly meetingContext = inject(MeetingContextService);
	private readonly meetingEndingSoonService = inject(MeetingEndingSoonService);
	private readonly recordingService = inject(RecordingService);
	private readonly broadcastState = inject(BroadcastStateService);
	private readonly smartLayoutService = inject(SmartLayoutService);
	private readonly uiConfig = inject(MeetingUiConfigService);
	private readonly panelService = inject(PanelService);
	private readonly participantService = inject(ParticipantService);
	private readonly reactionsService = inject(MeetingReactionsService);

	private readonly now = signal(Date.now());
	private readonly clockHandle = setInterval(() => this.now.set(Date.now()), 1000);

	/** `H:mm:ss` since the meeting started, or nothing for a meeting whose start is unknown. */
	protected readonly elapsedTime = computed(() => {
		const startedAt = this.meetingContext.meetingStartedAt();

		if (startedAt === undefined) return undefined;

		const totalSeconds = Math.max(0, Math.floor((this.now() - startedAt) / 1000));
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		const seconds = totalSeconds % 60;

		return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
	});

	private readonly endingSoonRemainingMs = this.meetingEndingSoonService.remainingMs;

	protected readonly isEndingSoon = computed(() => this.endingSoonRemainingMs() !== undefined);

	/** Solid warn treatment for the last minute; above it the chip stays on the calm surface. */
	protected readonly isEndingSoonUrgent = computed(() => {
		const remainingMs = this.endingSoonRemainingMs();
		return remainingMs !== undefined && remainingMs <= StatusRailComponent.ENDING_SOON_URGENT_MS;
	});

	/**
	 * `mm:ss`, or nothing once the countdown is spent: the backend force-ends the meeting at that
	 * same deadline, and a frozen `0:00` reads as a broken clock rather than a meeting about to
	 * close.
	 */
	protected readonly endingSoonTime = computed(() => {
		const remainingMs = this.endingSoonRemainingMs();

		if (remainingMs === undefined || remainingMs <= 0) return undefined;

		const totalSeconds = Math.ceil(remainingMs / 1000);
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;

		return `${minutes}:${seconds.toString().padStart(2, '0')}`;
	});

	protected readonly recordingStatus = this.recordingService.recordingStatus;

	/**
	 * Egress takes a few seconds to come up, and until it does there is no elapsed time to show.
	 * The chip goes up anyway, so asking for a recording is never met with silence.
	 */
	protected readonly isRecordingStarting = computed(() => this.recordingStatus().status === RecordingState.STARTING);

	protected readonly showRecordingChip = computed(
		() => this.isRecordingStarting() || this.recordingStatus().status === RecordingState.STARTED
	);

	protected readonly isBroadcastStarting = this.broadcastState.isStarting;
	protected readonly broadcastElapsed = this.broadcastState.elapsed;
	protected readonly showBroadcastChip = computed(() => this.broadcastState.isInProgress());

	/**
	 * The key is what actually encrypts: `MeetingLiveKitService` builds the room's `encryption`
	 * options from it, so a key here means the media really is end-to-end encrypted.
	 */
	protected readonly isE2eeActive = computed(() => (this.uiConfig.e2eeKeySignal() ?? '').trim() !== '');

	/** Published by the smart layout, which cannot render into the rail itself. */
	protected readonly hiddenParticipants = this.smartLayoutService.railHiddenParticipants;

	/** Every raised hand, whether or not the layout shows its tile. */
	protected readonly raisedHandCount = computed(() => this.participantService.raisedHands().length);

	/** The class pulse: how many people show each reaction right now, those off the grid included. */
	protected readonly reactionCounts = this.reactionsService.counts;
	protected readonly reactionEmoji = REACTION_EMOJI;

	protected readonly canOpenActivitiesPanel = this.uiConfig.activitiesPanelButtonSignal;
	protected readonly activitiesOptions = PanelActivitiesOptions;

	protected readonly canOpenParticipantsPanel = this.uiConfig.participantsPanelButtonSignal;

	readonly hasStatus = computed(
		() =>
			this.elapsedTime() !== undefined ||
			this.isEndingSoon() ||
			this.showRecordingChip() ||
			this.showBroadcastChip() ||
			this.isE2eeActive() ||
			this.raisedHandCount() > 0 ||
			this.reactionCounts().length > 0 ||
			this.hiddenParticipants() !== undefined
	);

	readonly needsSecondRow = signal(false);

	private readonly host: HTMLElement = inject(ElementRef).nativeElement;
	private readonly resizes = new ResizeObserver(() => this.measureRows());
	private readonly mutations = new MutationObserver(() => this.measureRows());

	constructor() {
		this.resizes.observe(this.host);
		this.mutations.observe(this.host, { childList: true, subtree: true, characterData: true });
	}

	ngOnDestroy(): void {
		clearInterval(this.clockHandle);
		this.resizes.disconnect();
		this.mutations.disconnect();
	}

	protected openParticipantsPanel(): void {
		if (!this.canOpenParticipantsPanel()) return;

		this.panelService.togglePanel(PanelType.PARTICIPANTS);
	}

	protected openActivitiesPanel(activity: PanelActivitiesOptions): void {
		if (!this.canOpenActivitiesPanel() || this.panelService.isActivitiesPanelOpened()) return;

		this.panelService.togglePanel(PanelType.ACTIVITIES, activity);
	}

	private measureRows(): void {
		const rail = this.host.querySelector<HTMLElement>('.status-rail');
		this.needsSecondRow.set(rail !== null && oneRowWidth(rail) > rail.getBoundingClientRect().width);
	}
}

/**
 * The width the rail's chips take side by side. Every chip keeps its width in either row except the
 * reactions, which a second row cuts short, so each group is summed from what it holds.
 */
function oneRowWidth(rail: HTMLElement): number {
	return rowWidth(rail, (group) => rowWidth(group, (chip) => chip.getBoundingClientRect().width));
}

function rowWidth(element: Element, childWidth: (child: Element) => number): number {
	const style = getComputedStyle(element);
	const children = Array.from(element.children).filter((child) => getComputedStyle(child).display !== 'none');
	const edges = [style.paddingLeft, style.paddingRight, style.borderLeftWidth, style.borderRightWidth];

	return (
		children.reduce((sum, child) => sum + childWidth(child), 0) +
		(parseFloat(style.columnGap) || 0) * Math.max(children.length - 1, 0) +
		edges.reduce((sum, edge) => sum + parseFloat(edge), 0)
	);
}
