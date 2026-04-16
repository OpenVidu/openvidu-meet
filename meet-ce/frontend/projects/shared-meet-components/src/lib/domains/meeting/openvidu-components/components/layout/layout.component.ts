import { LayoutAdditionalElementsDirective } from '../../directives/template/internals.directive';

import { CdkDrag, CdkDragRelease } from '@angular/cdk/drag-drop';
import {
	AfterViewInit,
	ChangeDetectionStrategy,
	ChangeDetectorRef,
	Component,
	contentChild,
	DestroyRef,
	effect,
	ElementRef,
	inject,
	OnDestroy,
	OnInit,
	TemplateRef,
	viewChild,
	ViewContainerRef
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { combineLatest, map } from 'rxjs';
import { StreamDirective } from '../../directives/template/openvidu-components-angular.directive';
import { ParticipantModel, ParticipantTrackPublication } from '../../models/participant.model';
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
	templateUrl: './layout.component.html',
	styleUrls: ['./layout.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: false
})
export class LayoutComponent implements OnInit, OnDestroy, AfterViewInit {
	/**
	 * @ignore
	 */
	readonly streamTemplateQuery = contentChild('stream', { read: TemplateRef });
	streamTemplate: TemplateRef<any> | undefined = undefined;

	/**
	 * @ignore
	 */
	readonly layoutAdditionalElementsTemplateQuery = contentChild('layoutAdditionalElements', { read: TemplateRef });
	layoutAdditionalElementsTemplate: TemplateRef<any> | undefined = undefined;

	/**
	 * @ignore
	 */
	readonly layoutContainerQuery = viewChild('layout', { read: ViewContainerRef });
	layoutContainer: ViewContainerRef | undefined = undefined;

	/**
	 * @ignore
	 */
	readonly cdkDragQuery = viewChild(CdkDrag);
	cdkDrag: CdkDrag | undefined = undefined;

	/**
	 * @ignore
	 */
	readonly localLayoutElementQuery = viewChild('localLayoutElement', { read: ElementRef });
	localLayoutElement: ElementRef | undefined = undefined;
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
	templateConfig: LayoutTemplateConfiguration = {};

	localParticipant: ParticipantModel | undefined;
	remoteParticipants: ParticipantModel[] = [];
	/**
	 * @ignore
	 */
	captionsEnabled = true;

	private readonly destroyRef = inject(DestroyRef);
	private resizeObserver: ResizeObserver | undefined = undefined;
	private resizeTimeout: ReturnType<typeof setTimeout> | undefined = undefined;
	private mutationObserver: MutationObserver | undefined = undefined;
	private mutationTimeout: ReturnType<typeof setTimeout> | undefined = undefined;
	private videoIsAtRight: boolean = false;
	private lastLayoutWidth: number = 0;
	private lastLayoutHeight: number = 0;

	private readonly layoutService = inject(LayoutService);
	private readonly panelService = inject(PanelService);
	private readonly participantService = inject(ParticipantService);
	private readonly globalService = inject(GlobalConfigService);
	private readonly directiveService = inject(OpenViduComponentsConfigService);
	private readonly cd = inject(ChangeDetectorRef);
	private readonly templateManagerService = inject(TemplateManagerService);
	private readonly querySyncEffect = effect(() => {
		this.streamTemplate = this.streamTemplateQuery() ?? this.streamTemplate;
		this.layoutAdditionalElementsTemplate = this.layoutAdditionalElementsTemplateQuery() ?? this.layoutAdditionalElementsTemplate;
		this.layoutContainer = this.layoutContainerQuery() ?? this.layoutContainer;
		this.cdkDrag = this.cdkDragQuery() ?? this.cdkDrag;
		this.localLayoutElement = this.localLayoutElementQuery() ?? this.localLayoutElement;
		this.setupTemplates();
		this.cd.markForCheck();
	});

	ngOnInit(): void {
		this.subscribeToParticipants();
		this.subscribeToCaptions();
	}

	ngAfterViewInit() {
		console.log('LayoutComponent.ngAfterViewInit');
		const layoutContainer = this.layoutContainer?.element?.nativeElement;
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
		this.localParticipant = undefined;
		this.remoteParticipants = [];
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
		this.templateConfig = this.templateManagerService.setupLayoutTemplates(
			this.externalStream(),
			this.externalLayoutAdditionalElements()
		);

		// Apply templates to component properties for backward compatibility
		this.applyTemplateConfiguration();
	}

	private applyTemplateConfiguration() {
		if (this.templateConfig.layoutStreamTemplate) {
			this.streamTemplate = this.templateConfig.layoutStreamTemplate;
		}
		if (this.templateConfig.layoutAdditionalElementsTemplate) {
			this.layoutAdditionalElementsTemplate = this.templateConfig.layoutAdditionalElementsTemplate;
		}
	}

	private listenToLayoutDomChanges() {
		const layoutContainer = this.layoutContainer?.element?.nativeElement;
		if (!layoutContainer) return;

		this.mutationObserver = new MutationObserver((mutations) => {
			const hasStructuralChanges = mutations.some(
				(mutation) => mutation.type === 'childList' && (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0)
			);
			if (!hasStructuralChanges) return;

			clearTimeout(this.mutationTimeout);
			this.mutationTimeout = setTimeout(() => {
				this.layoutService.update();
				this.cd.markForCheck();
			}, 0);
		});

		this.mutationObserver.observe(layoutContainer, {
			childList: true,
			subtree: true
		});
	}

	private subscribeToCaptions() {
		this.layoutService.captionsTogglingObs.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((value: boolean) => {
			this.captionsEnabled = value;
			this.cd.markForCheck();
			this.layoutService.update();
		});
	}

	private subscribeToParticipants() {
		this.participantService.localParticipant$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((p) => {
			if (p) {
				this.localParticipant = p;
				if (!this.localParticipant?.isMinimized) {
					this.videoIsAtRight = false;
				}
				this.layoutService.update();
				this.cd.markForCheck();
			}
		});

		combineLatest([this.participantService.remoteParticipants$, this.directiveService.layoutRemoteParticipants$])
			.pipe(
				map(([serviceParticipants, directiveParticipants]) =>
					directiveParticipants !== undefined ? directiveParticipants : serviceParticipants
				),
				takeUntilDestroyed(this.destroyRef)
			)
			.subscribe((participants) => {
				this.remoteParticipants = participants;
				this.layoutService.update();
				this.cd.markForCheck();
			});
	}

	private listenToResizeLayout() {
		const layoutContainer = this.layoutContainer?.element?.nativeElement;
		const cdkDrag = this.cdkDrag;
		if (!layoutContainer || !cdkDrag) return;

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
					this.cd.markForCheck();
				}
				// Handle minimized participant positioning
				if (this.localParticipant?.isMinimized) {
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
	private moveStreamToRight(parentWidth: number) {
		const cdkDrag = this.cdkDrag;
		if (!cdkDrag) return;

		const { y, width: elementWidth } = cdkDrag.element.nativeElement.getBoundingClientRect();
		const margin = 10;
		const newX = parentWidth - elementWidth - margin;
		cdkDrag.setFreeDragPosition({ x: newX, y });
	}

	private listenToCdkDrag() {
		const cdkDrag = this.cdkDrag;
		const layoutContainer = this.layoutContainer?.element?.nativeElement;
		const localLayoutElement = this.localLayoutElement?.nativeElement;
		if (!cdkDrag || !layoutContainer || !localLayoutElement) return;

		const handler = (_event: CdkDragRelease<any>) => {
			if (!this.panelService.isPanelOpened()) return;
			const { x, width } = localLayoutElement.getBoundingClientRect();
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

		cdkDrag.released.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(handler);

		if (this.globalService.isProduction()) return;
		// Just for allow E2E testing with drag and drop
		document.addEventListener('webcomponentTestingEndedDragAndDropEvent', handler as unknown as EventListener);
		document.addEventListener('webcomponentTestingEndedDragAndDropRightEvent', (event: any) => {
			const { x, y } = event.detail;
			cdkDrag.setFreeDragPosition({ x, y });
		});
	}
}
