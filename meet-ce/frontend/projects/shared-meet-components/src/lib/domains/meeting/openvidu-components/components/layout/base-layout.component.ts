import { CdkDrag, CdkDragRelease } from '@angular/cdk/drag-drop';
import { NgTemplateOutlet } from '@angular/common';
import {
	AfterViewInit,
	Component,
	computed,
	contentChild,
	contentChildren,
	DestroyRef,
	effect,
	ElementRef,
	inject,
	input,
	OnDestroy,
	signal,
	TemplateRef,
	viewChild,
	viewChildren,
	ViewContainerRef
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LayoutAdditionalElementsDirective } from '../../directives/template/internals.directive';
import { ParticipantStream } from '../../models/participant.model';
import { MeetingUiConfigService } from '../../services/config/meeting-ui-config.service';
import { SmartLayoutService } from '../../services/layout/smart-layout.service';
import { PanelService } from '../../services/panel/panel.service';
import { ParticipantService } from '../../services/participant/participant.service';
import { TemplateRegistryService } from '../../services/template/template-registry.service';
import { StreamComponent } from '../stream/stream.component';

/**
 *
 * The **BaseLayoutComponent** is hosted inside of the {@link MeetingViewComponent}.
 * It is in charge of displaying the participants streams layout.
 */
@Component({
	selector: 'ov-base-layout',
	imports: [CdkDrag, StreamComponent, NgTemplateOutlet],
	templateUrl: './base-layout.component.html',
	styleUrls: ['./base-layout.component.scss']
})
export class BaseLayoutComponent implements OnDestroy, AfterViewInit {
	private readonly layoutService = inject(SmartLayoutService);
	private readonly panelService = inject(PanelService);
	private readonly participantService = inject(ParticipantService);
	private readonly directiveService = inject(MeetingUiConfigService);
	private readonly templateRegistry = inject(TemplateRegistryService);
	private readonly destroyRef = inject(DestroyRef);

	// ── View queries ─────────────────────────────────────────────────────────────

	/** @ignore */
	readonly streamTemplateQuery = contentChild('stream', { read: TemplateRef });
	/** @ignore */
	readonly layoutAdditionalElementsDirectives = contentChildren(LayoutAdditionalElementsDirective);
	/** @ignore */
	readonly layoutContainer = viewChild('layout', { read: ViewContainerRef });
	/** @ignore */
	readonly defaultStreamTemplate = viewChild<TemplateRef<any>>('defaultStream');
	/** @ignore */
	readonly cdkDragQueries = viewChildren(CdkDrag);
	/** @ignore */
	readonly localLayoutElementQueries = viewChildren('localLayoutElement', { read: ElementRef });

	// ── Inputs ───────────────────────────────────────────────────────────────────

	/**
	 * Additional elements passed by a parent orchestrator (e.g. {@link SmartLayoutComponent}).
	 * Merged with content-projected `*ovLayoutAdditionalElements` directives.
	 */
	readonly externalAdditionalElements = input<readonly LayoutAdditionalElementsDirective[]>([]);

	// ── Computed streams ─────────────────────────────────────────────────────────

	readonly streamTemplate = computed(
		() => this.templateRegistry.stream() ?? this.streamTemplateQuery() ?? this.defaultStreamTemplate()
	);

	private readonly allAdditionalElements = computed(() => [
		...this.layoutAdditionalElementsDirectives(),
		...this.externalAdditionalElements()
	]);

	readonly layoutAdditionalElementsTopTemplates = computed(() =>
		this.allAdditionalElements()
			.filter((d) => d.slot() === 'top')
			.map((d) => d.template)
	);
	readonly layoutAdditionalElementsDefaultTemplates = computed(() => {
		const templates = this.allAdditionalElements()
			.filter((d) => d.slot() === 'default')
			.map((d) => d.template);
		const fallbackTemplate = this.templateRegistry.layoutAdditionalElements();
		return templates.length > 0 ? templates : fallbackTemplate ? [fallbackTemplate] : [];
	});
	readonly layoutAdditionalElementsBottomTemplates = computed(() =>
		this.allAdditionalElements()
			.filter((d) => d.slot() === 'bottom')
			.map((d) => d.template)
	);

	readonly localParticipant = this.participantService.localParticipant;

	readonly remoteParticipants = computed(() => {
		const directiveParticipants = this.directiveService.layoutRemoteParticipantsSignal();
		return directiveParticipants !== undefined
			? directiveParticipants
			: this.participantService.remoteParticipants();
	});

	/** Pre-computed stream list injected by a parent (e.g. {@link SmartLayoutComponent}). */
	readonly remoteStreamsOverride = input<ParticipantStream[] | undefined>(undefined, { alias: 'ovRemoteStreams' });

	readonly remoteStreams = computed(
		() => this.remoteStreamsOverride() ?? this.remoteParticipants().flatMap((p) => p.streams())
	);

	readonly remoteCameraStreams = computed(() => this.remoteStreams().filter((s) => !s.isScreenStream));
	readonly remoteScreenStreams = computed(() => this.remoteStreams().filter((s) => s.isScreenStream));

	// ── Drag position signal ─────────────────────────────────────────────────────

	/**
	 * Constant zero offset bound to non-floating local streams
	 */
	readonly ZERO_DRAG_POSITION = { x: 0, y: 0 } as const;

	/** Tracked drag offset; kept in sync so CD never resets an in-flight or post-drag position. */
	readonly currentDragPosition = signal<{ x: number; y: number }>(this.ZERO_DRAG_POSITION);

	// ── Resize constants ─────────────────────────────────────────────────────────

	private readonly ASPECT_RATIO = 218 / 123;
	private readonly MIN_RESIZE_WIDTH = 160;
	private readonly MIN_CORNER_MARGIN = 0;
	/** Gap kept between the floating tile and the right edge of the layout. */
	private readonly RIGHT_EDGE_MARGIN = 5;
	/** Duration of the grid-slot → bottom-right glide when the local tile starts floating. */
	private readonly FLOAT_GLIDE_MS = 250;
	/** Deceleration easing for the float glide (fast start, soft landing). */
	private readonly FLOAT_GLIDE_EASING = 'cubic-bezier(0.2, 0, 0, 1)';

	// ── Private observer / timeout state ─────────────────────────────────────────

	private resizeObserver: ResizeObserver | undefined;
	private resizeTimeout: ReturnType<typeof setTimeout> | undefined;
	private mutationObserver: MutationObserver | undefined;
	private mutationTimeout: ReturnType<typeof setTimeout> | undefined;

	// ── Drag tracking ─────────────────────────────────────────────────────────────

	private videoIsAtRight = false;
	private wasLocalFloating = false;
	private lastLayoutWidth = 0;
	private lastLayoutHeight = 0;
	/**
	 * True while the just-floated tile is gliding to the bottom-right corner (see
	 * {@link glideFloatingTileToBottomRight}) and until the final snap. Rects read during this
	 * window are mid-animation values; the ResizeObserver repositioning must not consume them or
	 * it redirects the glide (visible as the tile "trembling" toward the corner).
	 */
	private floatPlacementSettling = false;
	private floatPlacementTimeout: ReturnType<typeof setTimeout> | undefined;

	// ── Resize interaction state ─────────────────────────────────────────────────

	private isResizing = false;
	private resizeDirection = '';
	private resizeStartClientX = 0;
	private resizeStartWidth = 0;
	private resizeDragStartPos: { x: number; y: number } = this.ZERO_DRAG_POSITION;
	/** Cached CDK drag instance for the duration of a resize gesture (avoids per-event DOM lookup). */
	private resizingDrag: CdkDrag | undefined;

	private readonly boundResizeMove = this.onResizeMove.bind(this);
	private readonly boundResizeEnd = this.onResizeEnd.bind(this);

	// ── Reactive effect ───────────────────────────────────────────────────────────

	private readonly reactiveStateEffect = effect(() => {
		const localParticipant = this.localParticipant();
		// Read local streams so this effect re-runs when float/pin/mute state changes.
		const localStreams = localParticipant?.streams() ?? [];
		const isLocalFloating = localStreams.some((s) => s.isFloating);

		if (this.wasLocalFloating && !isLocalFloating) {
			// Restore from floating: clear CSS resize state, reset drag offset, reposition.
			this.videoIsAtRight = false;
			this.floatPlacementSettling = false;
			clearTimeout(this.floatPlacementTimeout);
			queueMicrotask(() => {
				const el = this.getActiveLocalDrag()?.element.nativeElement as HTMLElement | undefined;
				el?.style.removeProperty('--ov-min-w');
				el?.style.removeProperty('--ov-min-h');
				// Drop the float-time inline `transition: none` so the grid renderer's own
				// transition stamping animates the tile back into the layout.
				el?.style.removeProperty('transition');
				this.resetDragPosition();
				this.layoutService.update();
			});
		} else if (!this.wasLocalFloating && isLocalFloating) {
			// Just became floating: move to the bottom-right corner to avoid overlapping the main layout.
			// Mark it right-anchored so layout/panel resizes keep it pinned to the right edge.
			this.videoIsAtRight = true;
			this.floatPlacementSettling = true;
			// FLIP glide: capture the tile's grid rect now — effects run before the template applies
			// the .OV_floating class, so this is the pre-float geometry — then place the tile at the
			// corner and glide only the CDK transform (compositor-driven; see glideFloatingTile...).
			const gridRect = this.getActiveLocalDrag()?.element.nativeElement.getBoundingClientRect();
			requestAnimationFrame(() => this.glideFloatingTileToBottomRight(gridRect));
			clearTimeout(this.floatPlacementTimeout);
			this.floatPlacementTimeout = setTimeout(() => {
				// Final correction with transitions off: the container reflows while the glide runs
				// (its content height collapses as the tile leaves the grid), so snap the last few
				// pixels and hand control back to the resize/drag handlers.
				const el = this.getActiveLocalDrag()?.element.nativeElement as HTMLElement | undefined;
				el?.style.setProperty('transition', 'none');
				this.moveStreamToBottomRight();
				this.floatPlacementSettling = false;
			}, this.FLOAT_GLIDE_MS + 50);
		}

		this.wasLocalFloating = isLocalFloating;
		this.remoteStreams(); // subscribe to remote track publish/unpublish, pin, mute changes
		this.layoutService.update();
	});

	// ── Lifecycle ─────────────────────────────────────────────────────────────────

	ngAfterViewInit(): void {
		const container = this.layoutContainer()?.element?.nativeElement;

		if (!container) return;

		this.layoutService.initialize(container);
		const rect = container.getBoundingClientRect();
		this.lastLayoutWidth = rect.width;
		this.lastLayoutHeight = rect.height;
		this.listenToLayoutDomChanges(container);
		this.listenToResizeLayout(container);
		this.listenToCdkDrag(container);
	}

	ngOnDestroy(): void {
		this.resizeObserver?.disconnect();
		this.mutationObserver?.disconnect();
		clearTimeout(this.resizeTimeout);
		clearTimeout(this.mutationTimeout);
		clearTimeout(this.floatPlacementTimeout);
		document.removeEventListener('pointermove', this.boundResizeMove);
		document.removeEventListener('pointerup', this.boundResizeEnd);
		this.layoutService.clear();
	}

	// ── Public helpers ────────────────────────────────────────────────────────────

	/**
	 * Track-by function for `@for` loops over {@link ParticipantStream} items.
	 * Using a stable `identity-streamId` key ensures the `StreamComponent` instance is
	 * reused across track subscription cycles, preventing flicker from DOM recreation.
	 */
	trackParticipantElement(_: number, stream: ParticipantStream): string {
		return `${stream.participant.identity}-${stream.streamId}`;
	}

	/** Called from the template when the user presses on a corner resize handle. */
	onResizeStart(event: PointerEvent, direction: string): void {
		event.preventDefault();
		event.stopPropagation();

		this.resizingDrag = this.getActiveLocalDrag();

		if (!this.resizingDrag) return;

		this.isResizing = true;
		this.resizeDirection = direction;
		this.resizeStartClientX = event.clientX;
		this.resizeStartWidth = this.resizingDrag.element.nativeElement.getBoundingClientRect().width;
		this.resizeDragStartPos = { ...this.currentDragPosition() };

		document.addEventListener('pointermove', this.boundResizeMove);
		document.addEventListener('pointerup', this.boundResizeEnd);
	}

	// ── Private: resize handlers ──────────────────────────────────────────────────

	private onResizeMove(event: PointerEvent): void {
		if (!this.isResizing || !this.resizingDrag) return;

		const deltaX = event.clientX - this.resizeStartClientX;
		const container = this.layoutContainer()?.element?.nativeElement;
		const maxWidth = container ? container.getBoundingClientRect().width * 0.9 : 800;

		const rawWidth =
			this.resizeDirection === 'se' || this.resizeDirection === 'ne'
				? this.resizeStartWidth + deltaX
				: this.resizeStartWidth - deltaX;

		const newWidth = Math.max(this.MIN_RESIZE_WIDTH, Math.min(maxWidth, rawWidth));
		const newHeight = newWidth / this.ASPECT_RATIO;
		const widthChange = newWidth - this.resizeStartWidth;

		let newDragX = this.resizeDragStartPos.x;
		let newDragY = this.resizeDragStartPos.y;

		// Anchor the opposite edge by compensating the drag position.
		if (this.resizeDirection === 'sw' || this.resizeDirection === 'nw') {
			newDragX = this.resizeDragStartPos.x - widthChange;
		}

		if (this.resizeDirection === 'ne' || this.resizeDirection === 'nw') {
			newDragY = this.resizeDragStartPos.y - (newHeight - this.resizeStartWidth / this.ASPECT_RATIO);
		}

		const el = this.resizingDrag.element.nativeElement as HTMLElement;
		el.style.setProperty('--ov-min-w', `${newWidth}px`);
		el.style.setProperty('--ov-min-h', `${newHeight}px`);
		this.setDragPosition({ x: newDragX, y: newDragY }, this.resizingDrag);
	}

	private onResizeEnd(_event: PointerEvent): void {
		if (!this.isResizing) return;

		this.isResizing = false;
		this.resizingDrag = undefined;
		document.removeEventListener('pointermove', this.boundResizeMove);
		document.removeEventListener('pointerup', this.boundResizeEnd);
	}

	// ── Private: layout observer setup ───────────────────────────────────────────

	private listenToLayoutDomChanges(container: HTMLElement): void {
		this.mutationObserver = new MutationObserver((mutations) => {
			const hasStructuralChanges = mutations.some(
				(m) => m.type === 'childList' && (m.addedNodes.length > 0 || m.removedNodes.length > 0)
			);

			if (!hasStructuralChanges) return;

			clearTimeout(this.mutationTimeout);
			this.mutationTimeout = setTimeout(() => this.layoutService.update(), 0);
		});

		this.mutationObserver.observe(container, { childList: true, subtree: true });
	}

	/**
	 * Sets up a ResizeObserver on the layout container to detect size changes and update the layout accordingly.
	 * Also handles repositioning of the floating local participant stream when the layout size changes.
	 * The resize handling is debounced to avoid excessive layout updates during rapid size changes.
	 */
	private listenToResizeLayout(container: HTMLElement): void {
		this.resizeObserver = new ResizeObserver((entries) => {
			const { width: parentWidth, height: parentHeight } = entries[0].contentRect;

			clearTimeout(this.resizeTimeout);
			this.resizeTimeout = setTimeout(() => {
				if (
					Math.abs(this.lastLayoutWidth - parentWidth) > 1 ||
					Math.abs(this.lastLayoutHeight - parentHeight) > 1
				) {
					this.layoutService.update();
				}

				// While the float glide is settling, rects are mid-animation — skip the
				// repositioning entirely (the pending final snap already lands the tile).
				if (this.localParticipant()?.isFloating && !this.floatPlacementSettling) {
					const drag = this.getActiveLocalDrag();

					if (drag) {
						if (this.panelService.isPanelOpened()) {
							if (this.lastLayoutWidth < parentWidth) {
								if (this.videoIsAtRight) this.moveStreamToRight(parentWidth, drag);
							} else {
								const { x, width } = drag.element.nativeElement.getBoundingClientRect();
								this.videoIsAtRight = x + width >= parentWidth;

								if (this.videoIsAtRight) this.moveStreamToRight(parentWidth, drag);
							}
						} else if (this.videoIsAtRight) {
							this.moveStreamToRight(parentWidth, drag);
						}
					}
				}

				this.lastLayoutWidth = parentWidth;
				this.lastLayoutHeight = parentHeight;
			}, 100);
		});

		this.resizeObserver.observe(container);
	}

	private listenToCdkDrag(container: HTMLElement): void {
		const onRelease = (event: CdkDragRelease<any>): void => {
			const el = event.source.element.nativeElement as HTMLElement;
			// Sync signal with the actual post-drag transform so CD never resets it.
			this.setDragPosition(this.getActualDragPosition(el), event.source);

			if (!this.panelService.isPanelOpened()) return;

			const { x, width } = el.getBoundingClientRect();
			this.videoIsAtRight = x !== 0 && x + width >= container.getBoundingClientRect().width;
		};

		this.localParticipantDrags().forEach((drag) =>
			drag.released.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(onRelease)
		);
	}

	// ── Private: drag helpers ─────────────────────────────────────────────────────

	/**
	 * Returns CDK drag instances for all local participant elements.
	 */
	private localParticipantDrags(): CdkDrag[] {
		return this.cdkDragQueries().filter((drag) =>
			(drag.element.nativeElement as HTMLElement).classList.contains('local_participant')
		);
	}

	/**
	 * Returns the CdkDrag for the floating local camera stream, falling back to
	 * the non-screen local participant when no element is currently floating.
	 */
	private getActiveLocalDrag(): CdkDrag | undefined {
		const drags = this.cdkDragQueries();
		const floating = drags.find((d) => {
			const el = d.element.nativeElement as HTMLElement;
			return el.classList.contains('local_participant') && el.classList.contains('OV_floating');
		});
		return (
			floating ??
			drags.find((d) => {
				const el = d.element.nativeElement as HTMLElement;
				return el.classList.contains('local_participant') && !el.classList.contains('OV_screen');
			})
		);
	}

	/**
	 * Updates the CDK drag position imperatively and keeps `currentDragPosition` in sync
	 * so that Angular's CD binding `[cdkDragFreeDragPosition]="currentDragPosition()"` never
	 * resets the position to a stale value.
	 */
	private setDragPosition(pos: { x: number; y: number }, drag = this.getActiveLocalDrag()): void {
		drag?.setFreeDragPosition(pos);
		this.currentDragPosition.set(pos);
	}

	private moveStreamToRight(parentWidth: number, drag = this.getActiveLocalDrag()): void {
		if (!drag) return;

		const { width } = drag.element.nativeElement.getBoundingClientRect();
		// Preserve the last SET y target rather than rect.y: a rect read while the tile is
		// animating returns a mid-flight y, which would redirect the move instead of only
		// re-anchoring it horizontally.
		this.setDragPosition({ x: parentWidth - width - this.RIGHT_EDGE_MARGIN, y: this.currentDragPosition().y }, drag);
	}

	/**
	 * Animates the just-floated tile from its grid slot to the bottom-right corner using the FLIP
	 * technique on the CDK drag transform only.
	 *
	 * Why not let the grid renderer's `transition: all 0.1s linear` handle it (previous behavior):
	 * that eased top/left/width/height AND the transform at once — two opposing coordinate-system
	 * animations that mostly cancel out, forcing a reflow on every frame (dropped frames, visible
	 * stutter) and easing every later programmatic placement and pointer drag. Instead: transitions
	 * are turned OFF inline (they stay off while the tile floats, so dragging/resizing is 1:1), the
	 * tile is placed at its final corner instantly, and only the compositor-friendly `transform`
	 * glides from the old grid slot (center-anchored) to the corner with a deceleration curve.
	 */
	private glideFloatingTileToBottomRight(gridRect: DOMRect | undefined): void {
		const drag = this.getActiveLocalDrag();
		const el = drag?.element.nativeElement as HTMLElement | undefined;

		if (!drag || !el) return;

		// Neutralize the renderer's inherited `transition: all` before any placement.
		el.style.setProperty('transition', 'none');
		this.moveStreamToBottomRight(drag);

		if (!gridRect) return;

		const target = this.currentDragPosition();
		const cornerRect = el.getBoundingClientRect();
		// Center-anchored FLIP delta: the (now small) tile starts centered on the old grid slot.
		const dx = gridRect.x + gridRect.width / 2 - (cornerRect.x + cornerRect.width / 2);
		const dy = gridRect.y + gridRect.height / 2 - (cornerRect.y + cornerRect.height / 2);

		if (dx === 0 && dy === 0) return;

		// Start frame: back over the grid slot. Applied straight on CDK (not via setDragPosition)
		// so currentDragPosition keeps holding the real target for any concurrent handler.
		drag.setFreeDragPosition({ x: target.x + dx, y: target.y + dy });
		void el.offsetWidth; // flush styles so the start position is committed before the glide

		el.style.setProperty('transition', `transform ${this.FLOAT_GLIDE_MS}ms ${this.FLOAT_GLIDE_EASING}`);
		drag.setFreeDragPosition(target);
	}

	private moveStreamToBottomRight(drag = this.getActiveLocalDrag()): void {
		if (!drag) return;

		const container = this.layoutContainer()?.element?.nativeElement as HTMLElement | undefined;

		if (!container) return;

		// Use the known minimum floating size (CSS constants) rather than reading the DOM:
		// at the moment the effect fires the .OV_floating class may not yet be painted,
		// so getBoundingClientRect would still report the layout-driven size.
		const { width: containerWidth, height: containerHeight } = container.getBoundingClientRect();
		const floatingWidth = this.MIN_RESIZE_WIDTH;
		const floatingHeight = this.MIN_RESIZE_WIDTH / this.ASPECT_RATIO;
		this.setDragPosition(
			{
				x: containerWidth - floatingWidth - this.RIGHT_EDGE_MARGIN,
				y: containerHeight - floatingHeight - this.MIN_CORNER_MARGIN
			},
			drag
		);
	}

	private resetDragPosition(): void {
		for (const drag of this.localParticipantDrags()) {
			drag.reset();
			drag.setFreeDragPosition(this.ZERO_DRAG_POSITION);
		}

		this.currentDragPosition.set(this.ZERO_DRAG_POSITION);
	}

	/** Reads the actual CDK transform from the element's computed style. */
	private getActualDragPosition(element: HTMLElement): { x: number; y: number } {
		const transformStr = window.getComputedStyle(element).transform;

		if (!transformStr || transformStr === 'none') return this.ZERO_DRAG_POSITION;

		const { e, f } = new DOMMatrix(transformStr);
		return { x: e, y: f };
	}
}
