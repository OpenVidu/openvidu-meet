import { effect, inject, Service } from '@angular/core';
import {
	LAYOUT_CONSTANTS,
	LayoutAlignment,
	LayoutClass,
	OpenViduLayout,
	OpenViduLayoutOptions,
	VIEWPORT_LAYOUT_PROFILES,
	ViewportProfile
} from '../../models/layout/layout.model';
import { ViewportService } from '../viewport/viewport.service';
import { LoggerService } from '../../../../../shared/services/logger.service';
import type { ILogger } from '../../../../../shared/models/logger.model';

/**
 * @internal
 */
@Service()
export class BaseLayoutService {
	private readonly viewportSrv = inject(ViewportService);

	layoutContainer: HTMLElement | undefined = undefined;
	protected openviduLayout: OpenViduLayout | undefined;
	protected openviduLayoutOptions!: OpenViduLayoutOptions;
	protected log: ILogger = inject(LoggerService).get('BaseLayoutService');

	private _layoutUpdateEffect = effect(() => {
		// Reading these registers the effect's viewport dependencies. `updateLayoutOptions()` only
		// reaches isMobile/isTablet/isPortrait (through `getOptions()`), so viewportInfo and
		// orientation are tracked here to also refresh on changes that don't flip those booleans.
		const _trackedViewportSignals = [
			this.viewportSrv.viewportInfo(),
			this.viewportSrv.isMobile(),
			this.viewportSrv.orientation()
		];
		this.updateLayoutOptions();
	});

	constructor() {
		this.openviduLayoutOptions = this.getOptions();
	}

	initialize(container: HTMLElement) {
		this.layoutContainer = container;
		this.openviduLayout = new OpenViduLayout();
		this.openviduLayoutOptions = this.getOptions();

		if (this.layoutContainer) {
			this.openviduLayout.initLayoutContainer(this.layoutContainer, this.openviduLayoutOptions);
		}
	}

	update() {
		if (!this.openviduLayout || !this.layoutContainer) return;

		this.openviduLayoutOptions = this.getOptions();
		this.openviduLayout.updateLayout(this.layoutContainer, this.openviduLayoutOptions);
	}

	clear() {
		this.openviduLayout?.destroy();
		this.openviduLayout = undefined;
	}

	/**
	 * Get layout options adjusted to the current viewport
	 * @returns Layout options adjusted to the current viewport
	 */
	protected getOptions(): OpenViduLayoutOptions {
		const profile = VIEWPORT_LAYOUT_PROFILES[this.getViewportProfile()];

		return {
			...profile,
			fixedRatio: false,
			bigClass: LayoutClass.BIG_ELEMENT,
			ignoredClass: LayoutClass.IGNORED_ELEMENT,
			bigFixedRatio: false,
			bigFirst: true,
			animate: true,
			alignItems: LayoutAlignment.CENTER,
			bigAlignItems: LayoutAlignment.CENTER,
			maxWidth: Infinity,
			maxHeight: Infinity,
			stripMaxSize: LAYOUT_CONSTANTS.STRIP_MAX_SIZE,
			bigMaxWidth: Infinity,
			bigMaxHeight: Infinity
		};
	}

	protected getViewportProfile(): ViewportProfile {
		const isPortrait = this.viewportSrv.isPortrait();

		if (this.viewportSrv.isMobile()) {
			return isPortrait ? 'mobilePortrait' : 'mobileLandscape';
		}

		if (this.viewportSrv.isTablet()) {
			return isPortrait ? 'tabletPortrait' : 'tabletLandscape';
		}

		return 'desktop';
	}

	protected updateLayoutOptions(): void {
		const newOptions = this.getOptions();

		if (this.hasSignificantChanges(this.openviduLayoutOptions, newOptions)) {
			this.openviduLayoutOptions = newOptions;

			if (this.openviduLayout && this.layoutContainer) {
				this.openviduLayout.updateLayout(this.layoutContainer, this.openviduLayoutOptions);
			}
		}
	}

	protected hasSignificantChanges(oldOptions: OpenViduLayoutOptions, newOptions: OpenViduLayoutOptions): boolean {
		if (!oldOptions) return true;

		const significantProps: (keyof OpenViduLayoutOptions)[] = [
			'maxRatio',
			'minRatio',
			'bigMaxRatio',
			'bigMinRatio',
			'bigPercentage',
			'alignItems',
			'bigAlignItems'
		];

		return significantProps.some(
			(prop) =>
				Math.abs((oldOptions[prop] as number) - (newOptions[prop] as number)) > 0.01 ||
				oldOptions[prop] !== newOptions[prop]
		);
	}
}
