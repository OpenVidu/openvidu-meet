import {
	ChangeDetectionStrategy,
	Component,
	computed,
	contentChildren,
	effect,
	inject,
	input,
	OnDestroy,
	output,
	untracked
} from '@angular/core';
import { LayoutAdditionalElementsDirective } from '../../../directives/template/internals.directive';
import { ParticipantModel, ParticipantStream } from '../../../models/participant.model';
import { SmartLayoutService } from '../../../services/layout/smart-layout.service';
import { ParticipantService } from '../../../services/participant/participant.service';
import { HiddenParticipantsIndicatorComponent } from '../../hidden-participants-indicator/hidden-participants-indicator.component';
import { EXTERNAL_AUDIO_MANAGED } from '../../media-element/media-element.component';
import { BaseLayoutComponent } from '../base-layout.component';

@Component({
	selector: 'ov-smart-layout',
	imports: [
		BaseLayoutComponent,
		LayoutAdditionalElementsDirective,
		HiddenParticipantsIndicatorComponent
	],
	templateUrl: './smart-layout.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true,
	providers: [{ provide: EXTERNAL_AUDIO_MANAGED, useValue: true }]
})
export class SmartLayoutComponent implements OnDestroy {
	readonly layoutService = inject(SmartLayoutService);
	private readonly participantService = inject(ParticipantService);

	/** `*ovLayoutAdditionalElements` directives projected from the parent. */
	readonly projectedAdditionalElements = contentChildren(LayoutAdditionalElementsDirective);

	/** Whether smart-layout mode is allowed by the host. Defaults to `true`. */
	readonly ovSmartLayoutAllowed = input(true);

	/** Whether to show the hidden-participants indicator badge. Defaults to `true`. */
	readonly ovShowHiddenParticipantsIndicator = input(true);

	/** Emits when the user clicks the hidden-participants indicator. */
	readonly hiddenParticipantsIndicatorClicked = output<void>();

	readonly remoteParticipants = this.participantService.remoteParticipants;
	readonly localParticipant = this.participantService.localParticipant;

	/** True when both the host allows smart layout and the service has it enabled. */
	readonly isSmartLayoutActive = computed(
		() => this.ovSmartLayoutAllowed() && this.layoutService.isSmartLayoutEnabled()
	);

	/**
	 * Stable identity order for the camera-stream `@for` loop.
	 * In-place replacements (departing → arriving at the same index) let Angular see
	 * INSERT+REMOVE at the same slot rather than a DOM MOVE, preventing layout crashes.
	 */
	private displayedCameraOrder: string[] = [];

	private readonly visibleState = computed(() => {
		const allRemotes = this.remoteParticipants();
		const targetIds = new Set<string>();
		const streams: ParticipantStream[] = [];

		if (!this.isSmartLayoutActive()) {
			// Mosaic mode: preserve displayedCameraOrder across smart↔mosaic transitions
			// so existing DOM nodes keep their positions. Newcomers are appended at the end.
			const allIds = allRemotes.map((p) => p.identity);
			const currentSet = new Set(this.displayedCameraOrder.filter((id) => allIds.includes(id)));
			const mosaicOrder = this.displayedCameraOrder.filter((id) => allIds.includes(id));
			for (const p of allRemotes) {
				if (!currentSet.has(p.identity)) mosaicOrder.push(p.identity);
			}
			this.displayedCameraOrder = mosaicOrder;

			const participantMap = new Map(allRemotes.map((p) => [p.identity, p]));
			for (const id of mosaicOrder) {
				targetIds.add(id);
				const p = participantMap.get(id);
				if (p) streams.push(...p.streams());
			}
			return { streams, targetIds };
		}

		const availableIds = new Set(allRemotes.map((p) => p.identity));
		const toDisplayIds = this.layoutService.computeParticipantsToDisplay(availableIds);

		// Sync identity order with in-place swaps: departing participants are replaced
		// by arriving ones at the same index, so Angular @for sees INSERT+REMOVE instead of MOVE.
		this.displayedCameraOrder = this.syncDisplayOrder(this.displayedCameraOrder, toDisplayIds, availableIds);

		const participantMap = new Map(allRemotes.map((p) => [p.identity, p]));

		// Displayed participants: push all streams (camera + screen).
		// LayoutComponent splits them into separate camera/screen @for loops,
		// so interleaving here is safe — only within-category order matters.
		for (const id of this.displayedCameraOrder) {
			targetIds.add(id);
			const p = participantMap.get(id);
			if (p) streams.push(...p.streams());
		}

		// Non-displayed screen-sharing participants: add their screen stream only
		// so their audio+video is rendered without occupying a camera slot.
		for (const p of allRemotes) {
			if (!targetIds.has(p.identity) && p.isScreenShareEnabled) {
				const screen = p.streams().find((s) => s.isScreenStream);
				if (screen) streams.push(screen);
			}
		}

		return { streams, targetIds };
	});

	/** Streams to pass to {@link BaseLayoutComponent} via `ovRemoteStreams`. */
	readonly visibleRemoteStreams = computed(() => this.visibleState().streams);

	/** Number of remote participants hidden from the layout (smart layout only). */
	readonly hiddenParticipantsCount = computed(() => {
		const total = this.remoteParticipants().length;
		return Math.max(0, total - this.visibleState().targetIds.size);
	});

	/** Display names of the hidden remote participants, for tooltip rendering. */
	readonly hiddenParticipantNames = computed(() => {
		const { targetIds } = this.visibleState();
		return this.remoteParticipants()
			.filter((p) => !targetIds.has(p.identity))
			.map((p) => p.name || 'Unknown');
	});

	/** Whether to render the hidden-participants indicator in the layout. */
	readonly shouldShowHiddenParticipantsIndicator = computed(
		() => this.ovShowHiddenParticipantsIndicator() && this.isSmartLayoutActive() && this.hiddenParticipantsCount() > 0
	);

	/**
	 * When `true`, the indicator is rendered in the toolbar row rather than below the grid.
	 * This happens when no participant is pinned and the visible slot count is below the maximum,
	 * meaning there is room in the top bar.
	 */
	readonly showTopBarHiddenParticipantsIndicator = computed(() => {
		const hasPinnedParticipant =
			!!this.localParticipant()?.isPinned || this.remoteParticipants().some((p) => p.isPinned);
		const visibleCount = this.visibleState().targetIds.size;
		return !hasPinnedParticipant && visibleCount < this.layoutService.MAX_VISIBLE_REMOTE_PARTICIPANTS_LIMIT;
	});

	/**
	 * Returns a new identity order applying in-place replacements:
	 * each departing participant (present in `previousOrder` but absent from `targetIds`)
	 * is replaced by an arriving one at the same index, keeping all others at stable positions.
	 *
	 * @param previousOrder - Ordered identity list from the previous evaluation.
	 * @param targetIds - Identities that should be visible after this update.
	 * @param availableIds - Identities of all currently connected participants.
	 */
	private syncDisplayOrder(previousOrder: string[], targetIds: Set<string>, availableIds: Set<string>): string[] {
		const order = previousOrder.filter((id) => availableIds.has(id));
		const currentSet = new Set(order);

		const departing = order.filter((id) => !targetIds.has(id));
		const arriving = [...targetIds].filter((id) => !currentSet.has(id));

		for (const dep of departing) {
			const replacement = arriving.shift();
			const idx = order.indexOf(dep);
			if (idx === -1) continue;
			if (replacement) {
				order[idx] = replacement;
			} else {
				order.splice(idx, 1);
			}
		}

		for (const arr of arriving) {
			if (order.length < targetIds.size) order.push(arr);
		}

		return order;
	}

	/** Persistent `<audio>` elements for all remote participants' camera audio tracks. */
	private audioElements = new Map<string, { element: HTMLMediaElement; detach: () => void }>();
	private previousIsSmartLayoutActive = false;

	/** Resets speaker tracking when leaving smart-layout mode. */
	private readonly smartLayoutResetEffect = effect(() => {
		const isActive = this.isSmartLayoutActive();
		if (!isActive && this.previousIsSmartLayoutActive) {
			untracked(() => this.layoutService.resetSpeakerTrackingState());
		}
		this.previousIsSmartLayoutActive = isActive;
	});

	/**
	 * Manages persistent `<audio>` elements for all remote participants' camera audio tracks.
	 * Audio lifecycle is decoupled from layout visibility to prevent glitches during rotation.
	 * `streams()` is read before `untracked` to register track-publish/unpublish as reactive dependencies.
	 */
	private readonly audioElementsEffect = effect(() => {
		const allRemotes = this.remoteParticipants();
		// Read streams() for every remote participant to register track changes as dependencies.
		allRemotes.forEach((p) => p.streams());

		untracked(() => this.manageAudioTracks(allRemotes));
	});

	/** Removes disconnected participants from the speaker-priority list. */
	private readonly participantCleanupEffect = effect(() => {
		if (!this.isSmartLayoutActive()) return;

		const currentIds = new Set(this.remoteParticipants().map((p) => p.identity));
		untracked(() => this.layoutService.removeDisconnectedSpeakers(currentIds));
	});

	ngOnDestroy(): void {
		this.cleanupAudioElements(new Set());
		this.layoutService.resetSpeakerTrackingState();
		this.displayedCameraOrder = [];
	}

	private manageAudioTracks(participants: ParticipantModel[]): void {
		const activeTrackSids = new Set<string>();

		for (const participant of participants) {
			for (const stream of participant.streams()) {
				// Skip screen streams: their audio is rendered by StreamComponent.
				if (stream.isScreenStream) continue;

				const audioTrack = stream.audioTrack;
				if (audioTrack?.track && audioTrack.track.attach) {
					activeTrackSids.add(audioTrack.trackSid);
					let entry = this.audioElements.get(audioTrack.trackSid);
					if (!entry) {
						const element = audioTrack.track.attach();
						const track = audioTrack.track;
						entry = { element, detach: () => track.detach(element) };
						this.audioElements.set(audioTrack.trackSid, entry);
					}
					entry.element.muted = participant.isMutedForcibly;
				}
			}
		}

		this.cleanupAudioElements(activeTrackSids);
	}

	private cleanupAudioElements(activeSids: Set<string>): void {
		for (const [sid, { element, detach }] of this.audioElements) {
			if (!activeSids.has(sid)) {
				detach();
				element.remove();
				this.audioElements.delete(sid);
			}
		}
	}
}
