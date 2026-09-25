// Re-export all public types and constants for backward compatibility
export {
	LAYOUT_CONSTANTS,
	LayoutAlignment,
	LayoutClass,
	SidenavMode,
	VIEWPORT_LAYOUT_PROFILES
} from './layout-types.model';
export type {
	BestDimensions,
	BigFirstOption,
	ExtendedLayoutOptions,
	LayoutArea,
	LayoutBox,
	LayoutProfile,
	OpenViduLayoutOptions,
	ViewportProfile
} from './layout-types.model';

import { LayoutCalculator } from './layout-calculator.model';
import { LayoutDimensionsCache } from './layout-dimensions-cache.model';
import { elementHeight, elementWidth, readStyle, readStyleNumber, writeStyles } from './layout-dom.util';
import { ExtendedLayoutOptions, LAYOUT_CONSTANTS, LayoutClass, OpenViduLayoutOptions } from './layout-types.model';

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

	/**
	 * Pending animation-frame handle. Coalesces bursts of updateLayout calls (resize, mutation,
	 * sidenav animation, signal-driven re-renders) into a single layout pass per frame.
	 */
	private pendingFrame: number | null = null;

	constructor() {
		this.dimensionsCache = new LayoutDimensionsCache();
		this.calculator = new LayoutCalculator(this.dimensionsCache);
	}

	updateLayout(container: HTMLElement, opts: OpenViduLayoutOptions): void {
		this.layoutContainer = container;
		this.opts = opts;
		this.scheduleLayout();
	}

	initLayoutContainer(container: HTMLElement, opts: OpenViduLayoutOptions): void {
		this.updateLayout(container, opts);
	}

	clearCache(): void {
		this.dimensionsCache.clear();
	}

	/**
	 * Cancel any pending layout pass. Safe to call multiple times.
	 */
	destroy(): void {
		if (this.pendingFrame !== null) {
			cancelAnimationFrame(this.pendingFrame);
			this.pendingFrame = null;
		}

		this.dimensionsCache.clear();
	}

	/**
	 * Schedules the actual layout for the next animation frame. By the time the rAF callback
	 * fires the browser has computed style and layout for any synchronous DOM mutations, so
	 * `offsetWidth`/`offsetHeight` reads are accurate — replacing the prior 50ms guess.
	 */
	private scheduleLayout(): void {
		if (this.pendingFrame !== null) return;

		this.pendingFrame = requestAnimationFrame(() => {
			this.pendingFrame = null;
			this.applyLayout();
		});
	}

	private applyLayout(): void {
		if (!this.layoutContainer) return;

		if (readStyle(this.layoutContainer, 'display') === 'none') return;

		const containerWidth =
			elementWidth(this.layoutContainer) -
			readStyleNumber(this.layoutContainer, 'border-left') -
			readStyleNumber(this.layoutContainer, 'border-right');
		const containerHeight =
			elementHeight(this.layoutContainer) -
			readStyleNumber(this.layoutContainer, 'border-top') -
			readStyleNumber(this.layoutContainer, 'border-bottom');

		// If the container hasn't been laid out yet (e.g. just attached and still display:none on
		// an ancestor), skip silently — the next caller will re-schedule once it has size.
		if (containerWidth <= 0 || containerHeight <= 0) return;

		const extendedOpts: ExtendedLayoutOptions = { ...this.opts, containerWidth, containerHeight };
		const selector = `:scope > *:not(.${LayoutClass.IGNORED_ELEMENT}):not(.${LayoutClass.FLOATING_ELEMENT})`;
		const children = Array.from(this.layoutContainer.querySelectorAll<HTMLElement>(selector));
		const isBig = children.map((child) => child.classList.contains(this.opts.bigClass));
		const { boxes } = this.calculator.calculateLayout(
			extendedOpts,
			isBig,
			this.videoRatio(children[isBig.indexOf(true)])
		);
		const margin = containerWidth * LAYOUT_CONSTANTS.ELEMENT_MARGIN;

		children.forEach((child, index) => {
			const { left, top, width, height } = boxes[index];
			writeStyles(child, {
				position: 'absolute',
				left: `${left + margin}px`,
				top: `${top + margin}px`,
				width: `${width - 2 * margin}px`,
				height: `${height - 2 * margin}px`
			});
		});
	}

	/** Height / width of the video an element shows, or of the default one while it has none. */
	private videoRatio(element: HTMLElement | undefined): number {
		const video = element?.querySelector('video');

		return video?.videoWidth && video.videoHeight
			? video.videoHeight / video.videoWidth
			: LAYOUT_CONSTANTS.DEFAULT_VIDEO_HEIGHT / LAYOUT_CONSTANTS.DEFAULT_VIDEO_WIDTH;
	}
}
