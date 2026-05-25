
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

	/**
	 * @ignore
	 */
	readonly streamTemplateQuery = contentChild('stream', { read: TemplateRef });

	/**
	 * @ignore
	 */
	readonly layoutAdditionalElementsDirectives = contentChildren(LayoutAdditionalElementsDirective);

	/**
	 * @ignore
	 */
	readonly layoutContainer = viewChild('layout', { read: ViewContainerRef });

	/**
	 * @ignore
	 */
	readonly defaultStreamTemplate = viewChild<TemplateRef<any>>('defaultStream');

	/**
	 * @ignore
	 */
	readonly cdkDragQueries = viewChildren(CdkDrag);

	/**
	 * @ignore
	 */
	readonly localLayoutElementQueries = viewChildren('localLayoutElement', { read: ElementRef });

	/**
	 * Additional elements passed by a parent orchestrator (e.g. {@link SmartLayoutComponent}).
	 * Merged with content-projected `*ovLayoutAdditionalElements` directives.
	 */
	readonly externalAdditionalElements = input<readonly LayoutAdditionalElementsDirective[]>([]);

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
	/**
	 * Pre-computed stream list injected by a parent (e.g. {@link SmartLayoutComponent}).
	 * When provided, bypasses the local participant-to-streams derivation.
	 */
	readonly remoteStreamsOverride = input<ParticipantStream[] | undefined>(undefined, { alias: 'ovRemoteStreams' });

	/** Flattened remote stream list. Re-evaluates on track publish/unpublish, pin, mute, or participant list changes. */
	readonly remoteStreams = computed(() => this.remoteStreamsOverride() ?? this.remoteParticipants().flatMap((p) => p.streams()));

	/**
	 * Camera-only remote streams, rendered in a dedicated `@for` loop.
	 * Keeping cameras and screens in separate loops ensures screen DOM positions
	 * are never affected by camera additions or removals.
	 */
	readonly remoteCameraStreams = computed(() => this.remoteStreams().filter((s) => !s.isScreenStream));

	/**
	 * Screen-share-only remote streams, rendered in a dedicated `@for` loop.
	 * Keeping screens and cameras in separate loops ensures camera DOM positions
	 * are never affected by screen-share start or stop events.
	 */
	readonly remoteScreenStreams = computed(() => this.remoteStreams().filter((s) => s.isScreenStream));

	private readonly destroyRef = inject(DestroyRef);
	private resizeObserver: ResizeObserver | undefined = undefined;
	private resizeTimeout: ReturnType<typeof setTimeout> | undefined = undefined;
	private mutationObserver: MutationObserver | undefined = undefined;
	private mutationTimeout: ReturnType<typeof setTimeout> | undefined = undefined;
	private videoIsAtRight: boolean = false;
	private wasLocalMinimized: boolean = false;
	private lastLayoutWidth: number = 0;
	private lastLayoutHeight: number = 0;

	private readonly reactiveStateEffect = effect(() => {
		const localParticipant = this.localParticipant();
		const isLocalMinimized = !!localParticipant?.isMinimized;

		if (this.wasLocalMinimized && !isLocalMinimized) {
			// Restore from minimized: clear drag offset and let layout reposition the stream.
			this.videoIsAtRight = false;
			queueMicrotask(() => {
				this.resetDragPosition();
				this.layoutService.update();
			});
		}

		this.wasLocalMinimized = isLocalMinimized;
		this.remoteStreams(); // subscribe to track publish/unpublish, pin, mute changes
		this.layoutService.update();
	});

	ngAfterViewInit(): void {
		const layoutContainer = this.layoutContainer()?.element?.nativeElement;
		if (!layoutContainer) return;

		this.layoutService.initialize(layoutContainer);
		const rect = layoutContainer.getBoundingClientRect();
		this.lastLayoutWidth = rect.width;
		this.lastLayoutHeight = rect.height;
		this.listenToLayoutDomChanges();
		this.listenToResizeLayout();
		this.listenToCdkDrag();
	}

	ngOnDestroy(): void {
		this.resizeObserver?.disconnect();
		this.mutationObserver?.disconnect();
		clearTimeout(this.resizeTimeout);
		clearTimeout(this.mutationTimeout);
		this.layoutService.clear();
	}

	/**
	 * Track-by function for `@for` loops over {@link ParticipantStream} items.
	 * Using a stable `identity-streamId` key ensures the `StreamComponent` instance is
	 * reused across track subscription cycles, preventing flicker from DOM recreation.
	 */
	trackParticipantElement(_: number, stream: ParticipantStream): string {
		return `${stream.participant.identity}-${stream.streamId}`;
	}

	private listenToLayoutDomChanges() {
		const layoutContainer = this.layoutContainer()?.element?.nativeElement;
		if (!layoutContainer) return;

		this.mutationObserver = new MutationObserver((mutations) => {
			const hasStructuralChanges = mutations.some(
				(mutation) =>
					mutation.type === 'childList' &&
					(mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0)
			);
			if (!hasStructuralChanges) return;

			clearTimeout(this.mutationTimeout);
			this.mutationTimeout = setTimeout(() => {
				this.layoutService.update();
			}, 0);
		});

		this.mutationObserver.observe(layoutContainer, {
			childList: true,
			subtree: true
		});
	}

	private listenToResizeLayout() {
		const layoutContainer = this.layoutContainer()?.element?.nativeElement;
		if (!layoutContainer) return;

		this.resizeObserver = new ResizeObserver((entries) => {
			const { width: parentWidth, height: parentHeight } = entries[0].contentRect;

			clearTimeout(this.resizeTimeout);

			this.resizeTimeout = setTimeout(() => {
				const widthDiff = Math.abs(this.lastLayoutWidth - parentWidth);
				const heightDiff = Math.abs(this.lastLayoutHeight - parentHeight);
				if (widthDiff > 1 || heightDiff > 1) {
					this.layoutService.update();
				}

				if (this.localParticipant()?.isMinimized) {
					const cdkDrag = this.getActiveLocalDrag();
					if (!cdkDrag) {
						this.lastLayoutWidth = parentWidth;
						this.lastLayoutHeight = parentHeight;
						return;
					}

					if (this.panelService.isPanelOpened()) {
						if (this.lastLayoutWidth < parentWidth) {
							// Layout grew (e.g. wider panel replaced a narrower one): keep video pinned to the right edge.
							if (this.videoIsAtRight) {
								this.moveStreamToRight(parentWidth);
							}
						} else {
							// Layout shrank: re-evaluate whether the video is still at the right edge.
							window.dispatchEvent(new Event('resize'));
							const { x, width } = cdkDrag.element.nativeElement.getBoundingClientRect();
							this.videoIsAtRight = x + width >= parentWidth;
						}
					} else {
						if (this.videoIsAtRight) {
							this.moveStreamToRight(parentWidth);
						}
					}
				}

				this.lastLayoutWidth = parentWidth;
				this.lastLayoutHeight = parentHeight;
			}, 100);
		});

		this.resizeObserver.observe(layoutContainer);
	}

	private getActiveLocalDrag(): CdkDrag | undefined {
		const drags = this.cdkDragQueries();

		const minimizedLocalDrag = drags.find((drag) => {
			const element = drag.element.nativeElement as HTMLElement;
			return element.classList.contains('local_participant') && element.classList.contains('OV_minimized');
		});

		if (minimizedLocalDrag) {
			return minimizedLocalDrag;
		}

		return drags.find((drag) => {
			const element = drag.element.nativeElement as HTMLElement;
			return element.classList.contains('local_participant') && !element.classList.contains('OV_screen');
		});
	}

	private getActiveLocalLayoutElement(): HTMLElement | undefined {
		const elements = this.localLayoutElementQueries().map((el) => el.nativeElement as HTMLElement);

		const minimizedLocalElement = elements.find(
			(element) =>
				element.classList.contains('local_participant') && element.classList.contains('OV_minimized')
		);

		if (minimizedLocalElement) {
			return minimizedLocalElement;
		}

		return elements.find(
			(element) => element.classList.contains('local_participant') && !element.classList.contains('OV_screen')
		);
	}

	private moveStreamToRight(parentWidth: number) {
		const cdkDrag = this.getActiveLocalDrag();
		if (!cdkDrag) return;

		const { y, width: elementWidth } = cdkDrag.element.nativeElement.getBoundingClientRect();
		const margin = 10;
		const newX = parentWidth - elementWidth - margin;
		cdkDrag.setFreeDragPosition({ x: newX, y });
	}

	private resetDragPosition() {
		this.cdkDragQueries().forEach((drag) => {
			const element = drag.element.nativeElement as HTMLElement;
			if (element.classList.contains('local_participant')) {
				drag.reset();
				drag.setFreeDragPosition({ x: 0, y: 0 });
			}
		});
	}

	private listenToCdkDrag() {
		const layoutContainer = this.layoutContainer()?.element?.nativeElement;
		if (!layoutContainer) return;

		const handler = (event: CdkDragRelease<any>) => {
			if (!this.panelService.isPanelOpened()) return;
			const { x, width } = (event.source.element.nativeElement as HTMLElement).getBoundingClientRect();
			const { width: parentWidth } = layoutContainer.getBoundingClientRect();
			this.videoIsAtRight = x !== 0 && x + width >= parentWidth;
		};

		this.cdkDragQueries()
			.filter((drag) => (drag.element.nativeElement as HTMLElement).classList.contains('local_participant'))
			.forEach((drag) => {
				drag.released.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(handler);
			});

		if (this.globalService.isProduction()) return;

		// Development-only hooks used by E2E tests to simulate drag-and-drop events.
		document.addEventListener('webcomponentTestingEndedDragAndDropEvent', () => {
			if (!this.panelService.isPanelOpened()) return;
			const localLayoutElement = this.getActiveLocalLayoutElement();
			if (!localLayoutElement) return;
			const { x, width } = localLayoutElement.getBoundingClientRect();
			const { width: parentWidth } = layoutContainer.getBoundingClientRect();
			this.videoIsAtRight = x !== 0 && x + width >= parentWidth;
		});
		document.addEventListener('webcomponentTestingEndedDragAndDropRightEvent', (event: any) => {
			const { x, y } = event.detail;
			this.getActiveLocalDrag()?.setFreeDragPosition({ x, y });
		});
	}
}
