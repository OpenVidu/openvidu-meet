import {
	Component,
	computed,
	contentChildren,
	effect,
	ElementRef,
	inject,
	input,
	OnDestroy,
	output,
	signal,
	untracked,
	viewChild
} from '@angular/core';
import { LayoutAdditionalElementsDirective } from '../../../directives/template/internals.directive';
import { keepMosaicOrder, sameIdentityOrder, swapInPlace } from '../../../models/layout/smart-layout.model';
import { ParticipantModel, ParticipantStream } from '../../../models/participant.model';
import { SmartLayoutService } from '../../../services/layout/smart-layout.service';
import { ParticipantService } from '../../../services/participant/participant.service';
import { Track } from '../../../services/livekit';
import { HiddenCameraPause } from '../../../services/livekit/hidden-camera-pause';
import { HiddenParticipantsIndicatorComponent } from '../../hidden-participants-indicator/hidden-participants-indicator.component';
import { BaseLayoutComponent } from '../base-layout.component';

interface PersistentAudioEntry {
	element: HTMLAudioElement;
	track: Track;
	mounted: boolean;
}

@Component({
	selector: 'ov-smart-layout',
	imports: [BaseLayoutComponent, LayoutAdditionalElementsDirective, HiddenParticipantsIndicatorComponent],
	templateUrl: './smart-layout.component.html'
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

	/** Hidden container that hosts the persistent `<audio>` elements (DOM-mounted for Safari). */
	private readonly audioContainer = viewChild<ElementRef<HTMLElement>>('audioContainer');

	readonly remoteParticipants = this.participantService.remoteParticipants;
	readonly localParticipant = this.participantService.localParticipant;

	/** True when both the host allows smart layout and the service has it enabled. */
	readonly isSmartLayoutActive = computed(
		() => this.ovSmartLayoutAllowed() && this.layoutService.isSmartLayoutEnabled()
	);

	/**
	 * Previous-frame identity order for the camera-stream `@for` loop.
	 * Pure backing state for {@link displayedCameraOrder}; never mutated from computeds.
	 * In-place replacements (departing → arriving at the same index) let Angular see
	 * INSERT+REMOVE at the same slot rather than a DOM MOVE, preventing layout crashes.
	 */
	private readonly _displayedCameraOrder = signal<string[]>([]);

	/**
	 * Derives the next identity order from the current inputs and the previous order.
	 * Pure — does not mutate `_displayedCameraOrder`; {@link orderSyncEffect} persists the
	 * result back so the next evaluation sees the up-to-date previous frame.
	 */
	private readonly displayedCameraOrder = computed<string[]>(
		() => {
			const allIds = this.remoteParticipants().map((p) => p.identity);
			const previous = untracked(() => this._displayedCameraOrder());

			if (!this.isSmartLayoutActive()) return keepMosaicOrder(previous, allIds);

			const availableIds = new Set(allIds);
			return swapInPlace(previous, this.layoutService.computeParticipantsToDisplay(availableIds), availableIds);
		},
		// A fresh array holding the same order is not a change: without this, every active-speaker
		// event would hand the layout a new stream list and cost a full re-layout.
		{ equal: sameIdentityOrder }
	);

	/** Persists the latest computed order into `_displayedCameraOrder` for the next frame. */
	private readonly orderSyncEffect = effect(() => {
		const next = this.displayedCameraOrder();
		untracked(() => this._displayedCameraOrder.set(next));
	});

	private readonly visibleState = computed(() => {
		const order = this.displayedCameraOrder();
		const allRemotes = this.remoteParticipants();
		const targetIds = new Set<string>(order);
		const streams: ParticipantStream[] = [];

		const participantMap = new Map(allRemotes.map((p) => [p.identity, p]));

		// Displayed participants: push all streams (camera + screen).
		// LayoutComponent splits them into separate camera/screen @for loops,
		// so interleaving here is safe — only within-category order matters.
		for (const id of order) {
			const p = participantMap.get(id);

			if (p) streams.push(...p.streams());
		}

		// Hidden participants keep their screen share on screen without taking a camera slot.
		for (const p of allRemotes) {
			if (targetIds.has(p.identity) || !p.isScreenShareEnabled) continue;

			const screen = p.streams().find((s) => s.isScreenStream);

			if (screen) streams.push(screen);
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
			.map((p) => p.name ?? '');
	});

	/** Whether to render the hidden-participants indicator in the layout. */
	readonly shouldShowHiddenParticipantsIndicator = computed(
		() =>
			this.ovShowHiddenParticipantsIndicator() && this.isSmartLayoutActive() && this.hiddenParticipantsCount() > 0
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

	/** The status rail lives outside the layout, so the top-bar variant is published, not projected. */
	private readonly railHiddenParticipantsEffect = effect(() => {
		const showsInRail =
			this.shouldShowHiddenParticipantsIndicator() && this.showTopBarHiddenParticipantsIndicator();
		const summary = showsInRail
			? { count: this.hiddenParticipantsCount(), names: this.hiddenParticipantNames() }
			: undefined;

		untracked(() => this.layoutService.setRailHiddenParticipants(summary));
	});

	/**
	 * Persistent `<audio>` elements for every remote audio track (camera + screen-share).
	 * Keyed by `${identity}:${source}` so that a track re-publish (new `trackSid` under the
	 * same participant + source) reuses the same `<audio>` element via attach/detach swap,
	 * preventing the audible gap that would otherwise occur on tear-down + rebuild.
	 */
	private audioElements = new Map<string, PersistentAudioEntry>();

	/**
	 * Manages persistent `<audio>` elements for every remote audio track (camera + screen).
	 * Audio lifecycle is decoupled from layout visibility to prevent glitches during rotation.
	 * `streams()` is read before `untracked` to register track-publish/unpublish as reactive dependencies.
	 */
	private readonly audioElementsEffect = effect(() => {
		const allRemotes = this.remoteParticipants();
		// Read streams() for every remote participant to register track changes as dependencies.
		allRemotes.forEach((p) => p.streams());
		// Track the container so we re-run once viewChild resolves and can mount queued elements.
		const container = this.audioContainer()?.nativeElement ?? null;

		untracked(() => this.manageAudioTracks(allRemotes, container));
	});

	/** Removes disconnected participants from the speaker-priority list. */
	private readonly participantCleanupEffect = effect(() => {
		if (!this.isSmartLayoutActive()) return;

		const currentIds = new Set(this.remoteParticipants().map((p) => p.identity));
		untracked(() => this.layoutService.removeDisconnectedSpeakers(currentIds));
	});

	/** Camera tracks of the remote participants the layout does not render. */
	private readonly hiddenCameraTracks = computed(() => {
		const { targetIds } = this.visibleState();
		return this.remoteParticipants()
			.filter((p) => !targetIds.has(p.identity))
			.map((p) => p.streams().find((s) => s.isCameraStream)?.videoTrack?.track);
	});

	private readonly hiddenCameraPause = new HiddenCameraPause();

	/** Pauses the camera video of the participants the layout does not render. */
	private readonly hiddenCamerasEffect = effect(() => {
		const hidden = this.hiddenCameraTracks();
		untracked(() => this.hiddenCameraPause.pauseOnly(hidden));
	});

	ngOnDestroy(): void {
		this.cleanupAudioElements(new Set());
		this.hiddenCameraPause.release();
		this.layoutService.setRailHiddenParticipants(undefined);
	}

	private manageAudioTracks(participants: ParticipantModel[], container: HTMLElement | null): void {
		const activeKeys = new Set<string>();

		for (const participant of participants) {
			for (const stream of participant.streams()) {
				const audioTrack = stream.audioTrack;
				const track = audioTrack?.track;

				if (!track || typeof track.attach !== 'function') continue;

				const key = `${participant.identity}:${stream.source}`;
				activeKeys.add(key);

				let entry = this.audioElements.get(key);

				if (!entry) {
					const element = document.createElement('audio');
					element.autoplay = true;
					element.setAttribute('data-participant', participant.identity);
					element.setAttribute('data-source', stream.source);
					track.attach(element);
					entry = { element, track, mounted: false };
					this.audioElements.set(key, entry);
				} else if (entry.track !== track) {
					// Track re-publish under the same participant+source: swap the underlying
					// source without recreating the element, so playback never gaps.
					entry.track.detach(entry.element);
					track.attach(entry.element);
					entry.track = track;
				}

				if (container && !entry.mounted) {
					container.appendChild(entry.element);
					entry.mounted = true;
				}

				entry.element.muted = stream.isMutedForcibly;
			}
		}

		this.cleanupAudioElements(activeKeys);
	}

	private cleanupAudioElements(activeKeys: Set<string>): void {
		for (const [key, entry] of this.audioElements) {
			if (!activeKeys.has(key)) {
				entry.track.detach(entry.element);
				entry.element.remove();
				this.audioElements.delete(key);
			}
		}
	}
}
