import { LayoutAdditionalElementsDirective } from '../../directives/template/internals.directive';

import { CdkDrag, CdkDragRelease } from '@angular/cdk/drag-drop';
import { CommonModule } from '@angular/common';
import {
	AfterViewInit,
	ChangeDetectionStrategy,
	Component,
	computed,
	contentChild,
	DestroyRef,
	effect,
	ElementRef,
	inject,
	OnDestroy,
	TemplateRef,
	viewChild,
	viewChildren,
	ViewContainerRef
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { StreamDirective } from '../../directives/template/openvidu-components-angular.directive';
import { ParticipantTrackPublication } from '../../models/participant.model';
import { RemoteParticipantTracksPipe } from '../../pipes/participant.pipe';
import { OpenViduComponentsConfigService } from '../../services/config/directive-config.service';
import { GlobalConfigService } from '../../services/config/global-config.service';
import { LayoutService } from '../../services/layout/layout.service';
import { PanelService } from '../../services/panel/panel.service';
import { ParticipantService } from '../../services/participant/participant.service';
import { LayoutTemplateConfiguration, TemplateManagerService } from '../../services/template/template-manager.service';

/**
 *
 * The **LayoutComponent** is hosted inside of the {@link VideoconferenceComponent}.
 * It is in charge of displaying the participants streams layout.
 */
@Component({
	selector: 'ov-layout',
	imports: [CommonModule, CdkDrag, RemoteParticipantTracksPipe],
	templateUrl: './layout.component.html',
	styleUrls: ['./layout.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true
})
export class LayoutComponent implements OnDestroy, AfterViewInit {
	private readonly layoutService = inject(LayoutService);
	private readonly panelService = inject(PanelService);
	private readonly participantService = inject(ParticipantService);
	private readonly globalService = inject(GlobalConfigService);
	private readonly directiveService = inject(OpenViduComponentsConfigService);
	private readonly templateManagerService = inject(TemplateManagerService);

	/**
	 * @ignore
	 */
	readonly streamTemplateQuery = contentChild('stream', { read: TemplateRef });

	/**
	 * @ignore
	 */
	readonly layoutAdditionalElementsTemplateQuery = contentChild('layoutAdditionalElements', { read: TemplateRef });

	/**
	 * @ignore
	 */
	readonly layoutContainer = viewChild('layout', { read: ViewContainerRef });

	/**
	 * @ignore
	 */
	readonly cdkDragQueries = viewChildren(CdkDrag);

	/**
	 * @ignore
	 */
	readonly localLayoutElementQueries = viewChildren('localLayoutElement', { read: ElementRef });
	/**
	 * @ignore
	 */
	readonly externalStream = contentChild(StreamDirective);

	/**
	 * @ignore
	 */
	readonly externalLayoutAdditionalElements = contentChild(LayoutAdditionalElementsDirective);

	/**
	 * @ignore
	 */
	readonly templateConfig = computed<LayoutTemplateConfiguration>(() => {
		return this.templateManagerService.setupLayoutTemplates(
			this.externalStream(),
			this.externalLayoutAdditionalElements()
		);
	});
	readonly streamTemplate = computed(
		() => this.templateConfig().layoutStreamTemplate ?? this.streamTemplateQuery()
	);
	readonly layoutAdditionalElementsTemplate = computed(
		() =>
			this.templateConfig().layoutAdditionalElementsTemplate ??
			this.layoutAdditionalElementsTemplateQuery()
	);
	readonly localParticipant = this.participantService.localParticipantSignal;
	readonly remoteParticipants = computed(() => {
		const directiveParticipants = this.directiveService.layoutRemoteParticipantsSignal();
		return directiveParticipants !== undefined
			? directiveParticipants
			: this.participantService.remoteParticipantsSignal();
	});

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
			// On minimize -> restore transition, drop any drag offset and let layout place the stream again.
			this.videoIsAtRight = false;
			queueMicrotask(() => {
				this.resetDragPosition();
				this.layoutService.update();
			});
		}

		this.wasLocalMinimized = isLocalMinimized;
		this.remoteParticipants();
		this.layoutService.update();
	});

	ngAfterViewInit() {
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

	ngOnDestroy() {
		this.resizeObserver?.disconnect();
		this.mutationObserver?.disconnect();
		clearTimeout(this.resizeTimeout);
		clearTimeout(this.mutationTimeout);
		this.layoutService.clear();
	}

	/**
	 * @ignore
	 */
	trackParticipantElement(_: number, track: ParticipantTrackPublication) {
		// This method is used for trackBy in ngFor with the aim of improving performance
		// https://angular.io/api/core/TrackByFunction
		return track;
	}

	private setupTemplates() {
		// Template refs are exposed as computed signals.
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
				// Always update layout when container size changes
				// This ensures layout recalculates when parent containers change
				const widthDiff = Math.abs(this.lastLayoutWidth - parentWidth);
				const heightDiff = Math.abs(this.lastLayoutHeight - parentHeight);
				if (widthDiff > 1 || heightDiff > 1) {
					this.layoutService.update();
				}
				// Handle minimized participant positioning
				if (this.localParticipant()?.isMinimized) {
					const cdkDrag = this.getActiveLocalDrag();
					if (!cdkDrag) {
						this.lastLayoutWidth = parentWidth;
						this.lastLayoutHeight = parentHeight;
						return;
					}

					if (this.panelService.isPanelOpened()) {
						if (this.lastLayoutWidth < parentWidth) {
							// Layout is bigger than before. Maybe the settings panel(wider) has been transitioned to another panel.
							if (this.videoIsAtRight) {
								this.moveStreamToRight(parentWidth);
							}
						} else {
							// Layout is smaller than before. Emit resize event to update video position.
							window.dispatchEvent(new Event('resize'));
							const { x, width } = cdkDrag.element.nativeElement.getBoundingClientRect();
							this.videoIsAtRight = x + width >= parentWidth;
						}
					} else {
						if (this.videoIsAtRight) {
							// Panel is closed and layout has been resized. Video is at right, so move it to right.
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
			return element.classList.contains('local_participant') && !element.classList.contains('OV_ignored');
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
			(element) => element.classList.contains('local_participant') && !element.classList.contains('OV_ignored')
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
			if (x === 0) {
				// Video is at the left
				this.videoIsAtRight = false;
			} else if (x + width >= parentWidth) {
				// Video is at the right
				this.videoIsAtRight = true;
			} else {
				// Video is in another position
				this.videoIsAtRight = false;
			}
		};

		this.cdkDragQueries()
			.filter((drag) => (drag.element.nativeElement as HTMLElement).classList.contains('local_participant'))
			.forEach((drag) => {
				drag.released.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(handler);
			});

		if (this.globalService.isProduction()) return;
		// Just for allow E2E testing with drag and drop
		document.addEventListener('webcomponentTestingEndedDragAndDropEvent', () => {
			if (!this.panelService.isPanelOpened()) return;
			const localLayoutElement = this.getActiveLocalLayoutElement();
			if (!localLayoutElement) return;
			const { x, width } = localLayoutElement.getBoundingClientRect();
			const { width: parentWidth } = layoutContainer.getBoundingClientRect();
			if (x === 0) {
				this.videoIsAtRight = false;
			} else if (x + width >= parentWidth) {
				this.videoIsAtRight = true;
			} else {
				this.videoIsAtRight = false;
			}
		});
		document.addEventListener('webcomponentTestingEndedDragAndDropRightEvent', (event: any) => {
			const { x, y } = event.detail;
			const cdkDrag = this.getActiveLocalDrag();
			cdkDrag?.setFreeDragPosition({ x, y });
		});
	}
}
