// Re-export all public types and constants for backward compatibility
export { LAYOUT_CONSTANTS, LayoutAlignment, LayoutClass, SidenavMode } from './layout-types.model';
export type {
	BestDimensions,
	BigFirstOption,
	ElementDimensions,
	ExtendedLayoutOptions,
	LayoutArea,
	LayoutBox,
	LayoutRow,
	OpenViduLayoutOptions
} from './layout-types.model';

import { LayoutCalculator } from './layout-calculator.model';
import { LayoutDimensionsCache } from './layout-dimensions-cache.model';
import { elementHeight, elementWidth, readStyle, readStyleNumber } from './layout-dom.util';
import { LayoutRenderer } from './layout-renderer.model';
import { ElementDimensions, ExtendedLayoutOptions, LAYOUT_CONSTANTS, LayoutClass, OpenViduLayoutOptions } from './layout-types.model';

/**
 * OpenViduLayout orchestrates layout calculation and rendering.
 * Maintains backward compatibility with existing API while delegating to specialized classes.
 *
 * @internal
 */
export class OpenViduLayout {
	private layoutContainer!: HTMLElement;
	private opts!: OpenViduLayoutOptions;

	private dimensionsCache: LayoutDimensionsCache;
	private calculator: LayoutCalculator;
	private renderer: LayoutRenderer;

	constructor() {
		this.dimensionsCache = new LayoutDimensionsCache();
		this.calculator = new LayoutCalculator(this.dimensionsCache);
		this.renderer = new LayoutRenderer();
	}

	updateLayout(container: HTMLElement, opts: OpenViduLayoutOptions) {
		setTimeout(() => {
			this.layoutContainer = container;
			this.opts = opts;

			if (readStyle(this.layoutContainer, 'display') === 'none') {
				return;
			}

			if (!this.layoutContainer.id) {
				this.layoutContainer.id = `OV_${this.cheapUUID()}`;
			}

			const extendedOpts: ExtendedLayoutOptions = {
				...opts,
				containerHeight:
					elementHeight(this.layoutContainer) -
					readStyleNumber(this.layoutContainer, 'border-top') -
					readStyleNumber(this.layoutContainer, 'border-bottom'),
				containerWidth:
					elementWidth(this.layoutContainer) -
					readStyleNumber(this.layoutContainer, 'border-left') -
					readStyleNumber(this.layoutContainer, 'border-right')
			};

			const selector = `#${this.layoutContainer.id}>*:not(.${LayoutClass.IGNORED_ELEMENT}):not(.${LayoutClass.MINIMIZED_ELEMENT})`;
			const children = Array.from(this.layoutContainer.querySelectorAll<HTMLElement>(selector));

			const elements = children.map((element) => this.describeElement(element));

			const layout = this.calculator.calculateLayout(extendedOpts, elements);
			this.renderer.renderLayout(this.layoutContainer, layout.boxes, children, this.opts.animate);
		}, LAYOUT_CONSTANTS.UPDATE_TIMEOUT);
	}

	initLayoutContainer(container: HTMLElement, opts: OpenViduLayoutOptions) {
		this.opts = opts;
		this.layoutContainer = container;
		this.updateLayout(container, opts);
	}

	getLayoutContainer(): HTMLElement {
		return this.layoutContainer;
	}

	clearCache(): void {
		this.dimensionsCache.clear();
	}

	private describeElement(element: HTMLElement): ElementDimensions {
		const dims = this.getChildDims(element);
		dims.big = element.classList.contains(this.opts.bigClass);
		dims.small = element.classList.contains(LayoutClass.SMALL_ELEMENT);
		dims.topBar = element.classList.contains(LayoutClass.TOP_BAR_ELEMENT);
		return dims;
	}

	private getChildDims(child: HTMLElement): ElementDimensions {
		const video =
			child instanceof HTMLVideoElement
				? child
				: (child.querySelector('video') as HTMLVideoElement | null);

		if (video && video.videoHeight && video.videoWidth) {
			return { height: video.videoHeight, width: video.videoWidth };
		}
		return {
			height: LAYOUT_CONSTANTS.DEFAULT_VIDEO_HEIGHT,
			width: LAYOUT_CONSTANTS.DEFAULT_VIDEO_WIDTH
		};
	}

	private cheapUUID(): string {
		if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
			return crypto.randomUUID();
		}
		return Math.floor(Math.random() * 100000000).toString();
	}
}
