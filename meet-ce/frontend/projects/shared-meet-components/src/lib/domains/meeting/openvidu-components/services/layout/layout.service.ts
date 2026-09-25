import { computed, effect, inject, Service, untracked } from '@angular/core';
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

	private readonly viewportProfile = computed(() => this.getViewportProfile());

	private readonly profileChangeEffect = effect(() => {
		this.viewportProfile();
		untracked(() => this.update());
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
		this.layoutContainer = undefined;
	}

	/**
	 * Get layout options adjusted to the current viewport
	 * @returns Layout options adjusted to the current viewport
	 */
	protected getOptions(): OpenViduLayoutOptions {
		const profile = VIEWPORT_LAYOUT_PROFILES[this.viewportProfile()];

		return {
			...profile,
			bigClass: LayoutClass.BIG_ELEMENT,
			ignoredClass: LayoutClass.IGNORED_ELEMENT,
			bigFirst: true,
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
}
