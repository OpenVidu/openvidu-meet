import {
	computed,
	contentChild,
	DestroyRef,
	Directive,
	effect,
	ElementRef,
	inject,
	OnDestroy,
	signal,
	untracked
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatSidenav, MatSidenavContainer } from '@angular/material/sidenav';
import { RuntimeConfigService } from '../../../../../shared/services/runtime-config.service';
import { SidenavMode } from '../../models/layout/layout.model';
import { PanelStatusInfo, PanelType } from '../../models/panel.model';
import { SmartLayoutService } from '../../services/layout/smart-layout.service';
import { PanelService } from '../../services/panel/panel.service';
import { TemplateRegistryService } from '../../services/template/template-registry.service';

/**
 * Owns the choreography between the Angular Material sidenav and the layout calculator: when the
 * sidenav opens, closes, changes width or switches mode, the video grid has to be recomputed while
 * the CSS transition runs. That is Material plumbing, not meeting logic, so it lives here instead of
 * inside the in-call view component.
 *
 * Applied to the `<mat-sidenav-container>` and read back through `exportAs`:
 *
 * ```html
 * <mat-sidenav-container ovSidenavLayout #sidenavLayout="ovSidenavLayout"
 *     [hasBackdrop]="sidenavLayout.hasBackdrop()">
 *     <mat-sidenav [mode]="sidenavLayout.mode()" [class.big]="sidenavLayout.isSettingsPanelOpened()">
 * ```
 *
 * The host element is both the drawer container and the element whose width decides SIDE vs OVER,
 * so the directive gets it from `ElementRef` — no reaching into the container's private fields, and
 * no `viewChild` plumbing in the host component.
 *
 * @internal
 */
@Directive({
	selector: 'mat-sidenav-container[ovSidenavLayout]',
	exportAs: 'ovSidenavLayout'
})
export class SidenavLayoutDirective implements OnDestroy {
	/** Container width (px) at or below which the sidenav overlays the content instead of pushing it. */
	private readonly SIDENAV_WIDTH_LIMIT_MODE = 790;
	private readonly LAYOUT_UPDATE_DEBOUNCE_MS = 100;
	/** Cadence used to follow the sidenav open/close CSS transition while it runs. */
	private readonly LAYOUT_ANIMATION_TICK_MS = 50;
	/** Grace period after Material reports a content-margin change, so the transition has settled. */
	private readonly CONTENT_MARGIN_SETTLE_MS = 250;
	/**
	 * Hard stop for the animation-follow interval. The Material drawer transition lasts 400ms; not
	 * every start path gets a matching stop event (a settings-panel swap at identical width never
	 * fires `_contentMarginChanges`), so without this cap the 50ms interval would keep forcing a
	 * layout reflow 20 times per second until the next open/close.
	 */
	private readonly LAYOUT_ANIMATION_MAX_MS = 600;

	private readonly container = inject(MatSidenavContainer, { self: true });
	private readonly hostElement: ElementRef<HTMLElement> = inject(ElementRef);
	private readonly destroyRef = inject(DestroyRef);
	private readonly layoutService = inject(SmartLayoutService);
	private readonly panelService = inject(PanelService);
	private readonly templateRegistry = inject(TemplateRegistryService);
	private readonly runtimeConfigService = inject(RuntimeConfigService);

	private readonly sidenavQuery = contentChild(MatSidenav);

	private readonly _mode = signal<SidenavMode>(SidenavMode.SIDE);

	/** SIDE (pushes the content) or OVER (overlays it), driven by the container width. */
	readonly mode = this._mode.asReadonly();
	readonly hasBackdrop = computed(() => this._mode() === SidenavMode.OVER);

	/** The settings panel is wider than every other panel, so the sidenav widens for it. */
	readonly isSettingsPanelOpened = computed(() => {
		const panel = this.panelService.panelOpened();
		return panel.isOpened && panel.panelType === PanelType.SETTINGS;
	});

	private boundSidenav: MatSidenav | undefined = undefined;
	private layoutUpdateTimeoutId: ReturnType<typeof setTimeout> | null = null;
	private contentMarginUpdateTimeoutId: ReturnType<typeof setTimeout> | null = null;
	private updateLayoutInterval: ReturnType<typeof setInterval> | undefined = undefined;
	private updateLayoutSafetyTimeoutId: ReturnType<typeof setTimeout> | null = null;
	private resizeObserver: ResizeObserver | undefined = undefined;

	/**
	 * With no toolbar template projected there is no 70px footer, so the container takes the full
	 * height that the stylesheet reserves for the toolbar.
	 */
	private readonly toolbarSpacingEffect = effect(() => {
		if (this.templateRegistry.toolbar()) return;

		const element = this.hostElement.nativeElement;
		element.style.height = '100%';
		element.style.minHeight = '100%';
		this.debouncedLayoutUpdate();
	});

	private readonly sidenavBindingsEffect = effect(() => {
		const sidenav = this.sidenavQuery();

		if (!sidenav || sidenav === this.boundSidenav) return;

		this.boundSidenav = sidenav;
		untracked(() => this.bindSidenav(sidenav));
	});

	private readonly panelStateEffect = effect(() => {
		const panel = this.panelService.panelOpened();
		const sidenav = this.sidenavQuery();

		if (!sidenav) return;

		untracked(() => this.applyPanelState(panel, sidenav));
	});

	constructor() {
		// Material publishes the margin it applied to the content for the drawer; that is the signal
		// that the open/close transition has finished laying out.
		this.container._contentMarginChanges
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe(() => this.scheduleContentMarginUpdate());
		this.observeContainerWidth();

		// The grid is sized from the container, so a viewport change has to recompute it. Bound as a
		// native listener (not a host binding) because the handler only produces DOM layout work:
		// update() already coalesces to one pass per animation frame, and a host (window:resize)
		// binding would additionally schedule a whole change-detection tick per resize event.
		const onWindowResize = () => this.layoutService.update();
		window.addEventListener('resize', onWindowResize, { passive: true });
		this.destroyRef.onDestroy(() => window.removeEventListener('resize', onWindowResize));
	}

	ngOnDestroy(): void {
		if (this.layoutUpdateTimeoutId !== null) {
			clearTimeout(this.layoutUpdateTimeoutId);
			this.layoutUpdateTimeoutId = null;
		}

		if (this.contentMarginUpdateTimeoutId !== null) {
			clearTimeout(this.contentMarginUpdateTimeoutId);
			this.contentMarginUpdateTimeoutId = null;
		}

		this.stopUpdateLayoutInterval();
		this.resizeObserver?.disconnect();
	}

	private bindSidenav(sidenav: MatSidenav): void {
		// While the sidenav animates there is no event telling us the intermediate widths, so the
		// layout is recomputed on a timer between the start of the animation and its end.
		sidenav.openedChange.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
			this.stopUpdateLayoutInterval();
			this.layoutService.update();
		});
		sidenav.openedStart.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.startUpdateLayoutInterval());
		sidenav.closedStart.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.startUpdateLayoutInterval());

		// The panel may already have been opened before the sidenav existed.
		this.applyPanelState(this.panelService.panelOpened(), sidenav);
	}

	private applyPanelState(panel: PanelStatusInfo, sidenav: MatSidenav): void {
		if (sidenav.opened && panel.isOpened) {
			// Switching between SETTINGS and any other panel changes the sidenav width, and the
			// container only re-measures the content margin while `autosize` is on. It is turned off
			// again once the margin has settled (see scheduleContentMarginUpdate).
			const involvesSettingsPanel =
				panel.panelType === PanelType.SETTINGS || panel.previousPanelType === PanelType.SETTINGS;

			if (involvesSettingsPanel) {
				if (!this.container.autosize) {
					this.container.autosize = true;
				}

				this.startUpdateLayoutInterval();
			}
		}

		if (panel.isOpened !== sidenav.opened) {
			panel.isOpened ? sidenav.open() : sidenav.close();
		}
	}

	/**
	 * Debounced layout update, to prevent excessive recalculations.
	 */
	private debouncedLayoutUpdate(delay: number = this.LAYOUT_UPDATE_DEBOUNCE_MS): void {
		if (this.layoutUpdateTimeoutId !== null) {
			clearTimeout(this.layoutUpdateTimeoutId);
		}

		this.layoutUpdateTimeoutId = setTimeout(() => {
			this.layoutService.update();
			this.layoutUpdateTimeoutId = null;
		}, delay);
	}

	private scheduleContentMarginUpdate(): void {
		if (this.contentMarginUpdateTimeoutId !== null) {
			clearTimeout(this.contentMarginUpdateTimeoutId);
		}

		this.contentMarginUpdateTimeoutId = setTimeout(() => {
			this.stopUpdateLayoutInterval();
			this.layoutService.update();

			if (this.container.autosize) {
				this.container.autosize = false;
			}

			this.contentMarginUpdateTimeoutId = null;
		}, this.CONTENT_MARGIN_SETTLE_MS);
	}

	private startUpdateLayoutInterval(): void {
		this.stopUpdateLayoutInterval();
		this.updateLayoutInterval = setInterval(() => {
			this.layoutService.update();
		}, this.LAYOUT_ANIMATION_TICK_MS);
		// Unconditional cap: whichever path started the interval, it never outlives the animation.
		this.updateLayoutSafetyTimeoutId = setTimeout(
			() => this.stopUpdateLayoutInterval(),
			this.LAYOUT_ANIMATION_MAX_MS
		);
	}

	private stopUpdateLayoutInterval(): void {
		if (this.updateLayoutInterval) {
			clearInterval(this.updateLayoutInterval);
			this.updateLayoutInterval = undefined;
		}

		if (this.updateLayoutSafetyTimeoutId !== null) {
			clearTimeout(this.updateLayoutSafetyTimeoutId);
			this.updateLayoutSafetyTimeoutId = null;
		}
	}

	private observeContainerWidth(): void {
		// In webcomponent mode keep the sidenav in SIDE mode regardless of container width.
		if (this.runtimeConfigService.isWebcomponentMode()) {
			return;
		}

		this.resizeObserver = new ResizeObserver((entries) => {
			const width = entries[0]?.contentRect.width ?? 0;

			// A zero width means the container is not rendered yet (the observer is created while the
			// view is still detached); it is not a real "narrow viewport" measurement.
			if (width === 0) return;

			const mode = width <= this.SIDENAV_WIDTH_LIMIT_MODE ? SidenavMode.OVER : SidenavMode.SIDE;

			if (this._mode() !== mode) {
				this._mode.set(mode);
			}
		});
		this.resizeObserver.observe(this.hostElement.nativeElement);
	}
}
