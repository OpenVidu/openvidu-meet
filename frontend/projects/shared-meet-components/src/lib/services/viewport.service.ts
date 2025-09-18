import { computed, Injectable, OnDestroy, signal } from '@angular/core';
import { debounceTime, distinctUntilChanged, fromEvent, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

/**
 * Viewport size categories based on design system breakpoints
 */
export type ViewportSize = 'mobile' | 'tablet' | 'desktop' | 'wide';

/**
 * Device orientation type
 */
export type DeviceOrientation = 'portrait' | 'landscape';

/**
 * Viewport information interface
 */
export interface ViewportInfo {
	width: number;
	height: number;
	size: ViewportSize;
	orientation: DeviceOrientation;
	isMobile: boolean;
	isTablet: boolean;
	isDesktop: boolean;
	isWide: boolean;
	isTouchDevice: boolean;
}

/**
 * Service for responsive viewport detection and device type identification.
 * Provides reactive signals and utilities for building responsive interfaces.
 */
@Injectable({
	providedIn: 'root'
})
export class ViewportService implements OnDestroy {
	// Design system breakpoints
	private readonly BREAKPOINTS = {
		mobile: 480,
		tablet: 768,
		desktop: 1024,
		wide: 1200
	} as const;

	// Reactive signals
	private readonly _width = signal(this.getCurrentWidth());
	private readonly _height = signal(this.getCurrentHeight());
	private readonly _isTouchDevice = signal(this.detectTouchDevice());

	// Cleanup subject
	private readonly destroy$ = new Subject<void>();

	constructor() {
		this.initializeResizeListener();
	}

	// ==== PUBLIC REACTIVE SIGNALS ====

	/**
	 * Current viewport width (reactive)
	 */
	readonly width = this._width.asReadonly();

	/**
	 * Current viewport height (reactive)
	 */
	readonly height = this._height.asReadonly();

	/**
	 * Whether device supports touch interactions (reactive)
	 */
	readonly isTouchDevice = this._isTouchDevice.asReadonly();

	/**
	 * Current viewport size category (computed)
	 */
	readonly viewportSize = computed<ViewportSize>(() => {
		const width = this._width();
		if (width >= this.BREAKPOINTS.wide) return 'wide';
		if (width >= this.BREAKPOINTS.desktop) return 'desktop';
		if (width >= this.BREAKPOINTS.tablet) return 'tablet';
		return 'mobile';
	});

	/**
	 * Device orientation (computed)
	 */
	readonly orientation = computed<DeviceOrientation>(() => {
		return this._width() > this._height() ? 'landscape' : 'portrait';
	});

	/**
	 * Whether current viewport is mobile size (computed)
	 */
	readonly isMobile = computed(() => this.viewportSize() === 'mobile');

	/**
	 * Whether current viewport is tablet size (computed)
	 */
	readonly isTablet = computed(() => this.viewportSize() === 'tablet');

	/**
	 * Whether current viewport is desktop size (computed)
	 */
	readonly isDesktop = computed(() => this.viewportSize() === 'desktop');

	/**
	 * Whether current viewport is wide desktop size (computed)
	 */
	readonly isWide = computed(() => this.viewportSize() === 'wide');

	/**
	 * Whether current viewport is mobile or smaller (computed)
	 */
	readonly isMobileView = computed(() => this._width() < this.BREAKPOINTS.tablet);

	/**
	 * Whether current viewport is tablet or smaller (computed)
	 */
	readonly isTabletDown = computed(() => this._width() < this.BREAKPOINTS.desktop);

	/**
	 * Whether current viewport is tablet or larger (computed)
	 */
	readonly isTabletUp = computed(() => this._width() >= this.BREAKPOINTS.tablet);

	/**
	 * Whether current viewport is desktop or larger (computed)
	 */
	readonly isDesktopUp = computed(() => this._width() >= this.BREAKPOINTS.desktop);

	/**
	 * Complete viewport information (computed)
	 */
	readonly viewportInfo = computed<ViewportInfo>(() => ({
		width: this._width(),
		height: this._height(),
		size: this.viewportSize(),
		orientation: this.orientation(),
		isMobile: this.isMobile(),
		isTablet: this.isTablet(),
		isDesktop: this.isDesktop(),
		isWide: this.isWide(),
		isTouchDevice: this._isTouchDevice()
	}));

	// ==== PUBLIC UTILITY METHODS ====

	/**
	 * Check if viewport matches specific size
	 */
	matchesSize(size: ViewportSize): boolean {
		return this.viewportSize() === size;
	}

	/**
	 * Check if viewport is smaller than specified size
	 */
	isSmallerThan(size: ViewportSize): boolean {
		const currentWidth = this._width();
		return currentWidth < this.BREAKPOINTS[size];
	}

	/**
	 * Check if viewport is larger than specified size
	 */
	isLargerThan(size: ViewportSize): boolean {
		const currentWidth = this._width();
		return currentWidth >= this.BREAKPOINTS[size];
	}

	/**
	 * Get responsive grid columns based on viewport and content count
	 */
	getGridColumns(itemCount = 0): string {
		if (this.isMobileView()) {
			return 'single-column';
		}
		if (this.isTablet()) {
			return itemCount > 6 ? 'two-columns' : 'single-column';
		}
		return itemCount > 10 ? 'three-columns' : 'two-columns';
	}

	/**
	 * Get appropriate icon size for current viewport
	 */
	getIconSize(): 'small' | 'medium' | 'large' {
		if (this.isMobileView()) return 'medium';
		if (this.isTablet()) return 'small';
		return 'small';
	}

	/**
	 * Get appropriate spacing size for current viewport
	 */
	getSpacing(): 'compact' | 'comfortable' | 'spacious' {
		if (this.isMobileView()) return 'compact';
		if (this.isTablet()) return 'comfortable';
		return 'spacious';
	}

	/**
	 * Check if device is in landscape mode (mobile context)
	 */
	isLandscape(): boolean {
		return this.orientation() === 'landscape';
	}

	/**
	 * Check if device is in portrait mode
	 */
	isPortrait(): boolean {
		return this.orientation() === 'portrait';
	}

	/**
	 * Get breakpoint value for specified size
	 */
	getBreakpoint(size: keyof typeof this.BREAKPOINTS): number {
		return this.BREAKPOINTS[size];
	}

	// ==== PRIVATE METHODS ====

	private getCurrentWidth(): number {
		return typeof window !== 'undefined' ? window.innerWidth : 1024;
	}

	private getCurrentHeight(): number {
		return typeof window !== 'undefined' ? window.innerHeight : 768;
	}

	private detectTouchDevice(): boolean {
		if (typeof window === 'undefined') return false;
		return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
	}

	private initializeResizeListener(): void {
		if (typeof window === 'undefined') return;

		fromEvent(window, 'resize')
			.pipe(
				debounceTime(150), // Debounce for performance
				distinctUntilChanged(),
				takeUntil(this.destroy$)
			)
			.subscribe(() => {
				this._width.set(this.getCurrentWidth());
				this._height.set(this.getCurrentHeight());
			});
	}

	ngOnDestroy(): void {
		this.destroy$.next();
		this.destroy$.complete();
	}
}
