
import { CdkDrag, CdkDragRelease } from '@angular/cdk/drag-drop';
import { CommonModule } from '@angular/common';
import {
	AfterViewInit,
	ChangeDetectionStrategy,
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
import { OpenViduComponentsConfigService } from '../../services/config/directive-config.service';
import { GlobalConfigService } from '../../services/config/global-config.service';
import { SmartLayoutService } from '../../services/layout/smart-layout.service';
import { PanelService } from '../../services/panel/panel.service';
import { ParticipantService } from '../../services/participant/participant.service';
import { TemplateRegistryService } from '../../services/template/template-registry.service';
import { StreamComponent } from '../stream/stream.component';

/**
 *
 * The **BaseLayoutComponent** is hosted inside of the {@link VideoconferenceComponent}.
 * It is in charge of displaying the participants streams layout.
 */
@Component({
	selector: 'ov-base-layout',
	imports: [CommonModule, CdkDrag, StreamComponent],
	templateUrl: './base-layout.component.html',
	styleUrls: ['./base-layout.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true
})
export class BaseLayoutComponent implements OnDestroy, AfterViewInit {
	private readonly layoutService = inject(SmartLayoutService);
	private readonly panelService = inject(PanelService);
	private readonly participantService = inject(ParticipantService);
	private readonly globalService = inject(GlobalConfigService);
	private readonly directiveService = inject(OpenViduComponentsConfigService);
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

	/** Tracked drag offset; kept in sync so CD never resets an in-flight or post-drag position. */
	readonly currentDragPosition = signal<{ x: number; y: number }>({ x: 0, y: 0 });

	// ── Resize constants ─────────────────────────────────────────────────────────

	private readonly ASPECT_RATIO = 230 / 130;
	private readonly MIN_RESIZE_WIDTH = 160;

	// ── Private observer / timeout state ─────────────────────────────────────────

	private resizeObserver: ResizeObserver | undefined;
	private resizeTimeout: ReturnType<typeof setTimeout> | undefined;
	private mutationObserver: MutationObserver | undefined;
	private mutationTimeout: ReturnType<typeof setTimeout> | undefined;

	// ── Drag tracking ─────────────────────────────────────────────────────────────

	private videoIsAtRight = false;
	private wasLocalMinimized = false;
	private lastLayoutWidth = 0;
	private lastLayoutHeight = 0;

	// ── Resize interaction state ─────────────────────────────────────────────────

	private isResizing = false;
	private resizeDirection = '';
	private resizeStartClientX = 0;
	private resizeStartWidth = 0;
	private resizeDragStartPos = { x: 0, y: 0 };
	/** Cached CDK drag instance for the duration of a resize gesture (avoids per-event DOM lookup). */
	private resizingDrag: CdkDrag | undefined;

	private readonly boundResizeMove = this.onResizeMove.bind(this);
	private readonly boundResizeEnd = this.onResizeEnd.bind(this);

	// ── Reactive effect ───────────────────────────────────────────────────────────

	private readonly reactiveStateEffect = effect(() => {
		const localParticipant = this.localParticipant();
		// Read local streams so this effect re-runs when minimize/pin/mute state changes.
		const localStreams = localParticipant?.streams() ?? [];
		const isLocalMinimized = localStreams.some((s) => s.isMinimized);

		if (this.wasLocalMinimized && !isLocalMinimized) {
			// Restore from minimized: clear CSS resize state, reset drag offset, reposition.
			this.videoIsAtRight = false;
			queueMicrotask(() => {
				const el = this.getActiveLocalDrag()?.element.nativeElement as HTMLElement | undefined;
				el?.style.removeProperty('--ov-min-w');
				el?.style.removeProperty('--ov-min-h');
				this.resetDragPosition();
				this.layoutService.update();
			});
		}

		this.wasLocalMinimized = isLocalMinimized;
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

	private listenToResizeLayout(container: HTMLElement): void {
		this.resizeObserver = new ResizeObserver((entries) => {
			const { width: parentWidth, height: parentHeight } = entries[0].contentRect;

			clearTimeout(this.resizeTimeout);
			this.resizeTimeout = setTimeout(() => {
				if (Math.abs(this.lastLayoutWidth - parentWidth) > 1 || Math.abs(this.lastLayoutHeight - parentHeight) > 1) {
					this.layoutService.update();
				}

				if (this.localParticipant()?.isMinimized) {
					const drag = this.getActiveLocalDrag();
					if (drag) {
						if (this.panelService.isPanelOpened()) {
							if (this.lastLayoutWidth < parentWidth) {
								if (this.videoIsAtRight) this.moveStreamToRight(parentWidth, drag);
							} else {
								window.dispatchEvent(new Event('resize'));
								const { x, width } = drag.element.nativeElement.getBoundingClientRect();
								this.videoIsAtRight = x + width >= parentWidth;
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

		if (!this.globalService.isProduction()) {
			this.installDevDragHooks(container);
		}
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
	 * Returns the CdkDrag for the minimized local camera stream, falling back to
	 * the non-screen local participant when no element is currently minimized.
	 */
	private getActiveLocalDrag(): CdkDrag | undefined {
		const drags = this.cdkDragQueries();
		const minimized = drags.find((d) => {
			const el = d.element.nativeElement as HTMLElement;
			return el.classList.contains('local_participant') && el.classList.contains('OV_minimized');
		});
		return (
			minimized ??
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
		const { y, width } = drag.element.nativeElement.getBoundingClientRect();
		this.setDragPosition({ x: parentWidth - width - 10, y }, drag);
	}

	private resetDragPosition(): void {
		for (const drag of this.localParticipantDrags()) {
			drag.reset();
			drag.setFreeDragPosition({ x: 0, y: 0 });
		}
		this.currentDragPosition.set({ x: 0, y: 0 });
	}

	/** Reads the actual CDK transform from the element's computed style. */
	private getActualDragPosition(element: HTMLElement): { x: number; y: number } {
		const transformStr = window.getComputedStyle(element).transform;
		if (!transformStr || transformStr === 'none') return { x: 0, y: 0 };
		const { e, f } = new DOMMatrix(transformStr);
		return { x: e, y: f };
	}

	// ── Private: dev-only E2E test hooks ─────────────────────────────────────────

	private installDevDragHooks(container: HTMLElement): void {
		document.addEventListener('webcomponentTestingEndedDragAndDropEvent', () => {
			if (!this.panelService.isPanelOpened()) return;
			const el = this.getActiveLocalDrag()?.element.nativeElement as HTMLElement | undefined;
			if (!el) return;
			const { x, width } = el.getBoundingClientRect();
			this.videoIsAtRight = x !== 0 && x + width >= container.getBoundingClientRect().width;
		});

		document.addEventListener('webcomponentTestingEndedDragAndDropRightEvent', (event: any) => {
			this.setDragPosition(event.detail as { x: number; y: number });
		});
	}
}
