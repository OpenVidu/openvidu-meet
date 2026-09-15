/**
 * @internal
 */
export enum LayoutClass {
	BIG_ELEMENT = 'OV_big',
	IGNORED_ELEMENT = 'OV_ignored',
	FLOATING_ELEMENT = 'OV_floating',
	CLASS_NAME = 'layout'
}

/**
 * @internal
 */
export enum SidenavMode {
	OVER = 'over',
	SIDE = 'side'
}

/**
 * @internal
 */
export enum LayoutAlignment {
	START = 'start',
	CENTER = 'center',
	END = 'end'
}

/**
 * Layout position options for big elements
 */
export type BigFirstOption = boolean | 'column' | 'row';

/**
 * Element dimensions interface
 */
export interface ElementDimensions {
	height: number;
	width: number;
	big?: boolean;
}

/**
 * Layout area definition
 */
export interface LayoutArea {
	top: number;
	left: number;
	width: number;
	height: number;
}

/**
 * Layout box positioning. Alias kept for backwards compatibility with the public surface.
 */
export type LayoutBox = LayoutArea;

/**
 * Row structure for layout calculations
 */
export interface LayoutRow {
	ratios: number[];
	width: number;
	height: number;
}

/**
 * Best dimensions calculation result
 */
export interface BestDimensions {
	maxArea: number;
	targetCols: number;
	targetRows: number;
	targetHeight: number;
	targetWidth: number;
	ratio: number;
}

/**
 * Extended layout options with container dimensions
 */
export interface ExtendedLayoutOptions extends OpenViduLayoutOptions {
	containerWidth: number;
	containerHeight: number;
}

/**
 * Layout calculation result containing positioned boxes and allocated areas
 */
export interface LayoutCalculationResult {
	boxes: LayoutBox[];
	areas: LayoutAreas;
}

/**
 * Layout areas for different element categories
 */
export interface LayoutAreas {
	big: LayoutArea | null;
	normal: LayoutArea | null;
}

/**
 * Element category used to route each element through the right layout area.
 * @internal
 */
export type ElementCategory = 'big' | 'normal';

/**
 * Categorized elements by type. `categories[i]` is the category assigned to the
 * original element at index `i` — used for O(N) reconstruction in original order.
 * @internal
 */
export interface CategorizedElements {
	big: ElementDimensions[];
	normal: ElementDimensions[];
	categories: ElementCategory[];
}

/**
 * Layout configuration constants
 */
export const LAYOUT_CONSTANTS = {
	DEFAULT_VIDEO_WIDTH: 640,
	DEFAULT_VIDEO_HEIGHT: 480,
	DEFAULT_MAX_RATIO: 3 / 2,
	DEFAULT_MIN_RATIO: 9 / 16,
	DEFAULT_BIG_PERCENTAGE: 0.8,
	STRIP_MAX_SIZE: 220,
	ANIMATION_DURATION: '0.1s',
	ANIMATION_EASING: 'linear'
} as const;

/**
 * @internal
 */
export interface OpenViduLayoutOptions {
	/** The narrowest ratio that will be used (2x3 by default) */
	maxRatio: number;
	/** The widest ratio that will be used (16x9 by default) */
	minRatio: number;
	/** If true, aspect ratio is maintained and minRatio/maxRatio are ignored */
	fixedRatio: boolean;
	/** Whether to animate transitions */
	animate: boolean;
	/** Class for elements that should be sized bigger */
	bigClass: string;
	/** Class for elements that should be ignored */
	ignoredClass: string;
	/** Maximum percentage of space big elements should take up */
	bigPercentage: number;
	/** Minimum percentage for big space to scale down whitespace */
	minBigPercentage: number;
	/** Fixed ratio for big elements */
	bigFixedRatio: boolean;
	/** Narrowest ratio for big elements */
	bigMaxRatio: number;
	/** Widest ratio for big elements */
	bigMinRatio: number;
	/** Position preference for big elements */
	bigFirst: BigFirstOption;
	/** Alignment for all elements */
	alignItems: LayoutAlignment;
	/** Alignment for big elements */
	bigAlignItems: LayoutAlignment;
	/** Maximum width of elements */
	maxWidth: number;
	/** Maximum height of elements */
	maxHeight: number;
	/**
	 * Largest a normal element may get while a big one shares the container: the strip of cameras
	 * beside a shared screen. Without it the strip keeps a share of the container and grows with
	 * the screen, taking room the shared content reads better in.
	 */
	stripMaxSize: number;
	/** Maximum width for big elements */
	bigMaxWidth: number;
	/** Maximum height for big elements */
	bigMaxHeight: number;
}

/**
 * The options that depend on the viewport: the shape of a tile and the split a shared screen makes.
 *
 * @internal
 */
export type LayoutProfile = Pick<
	OpenViduLayoutOptions,
	'maxRatio' | 'minRatio' | 'bigMaxRatio' | 'bigMinRatio' | 'bigPercentage' | 'minBigPercentage'
>;

/**
 * Viewport a layout profile is written for.
 *
 * @internal
 */
export type ViewportProfile = 'mobilePortrait' | 'mobileLandscape' | 'tabletPortrait' | 'tabletLandscape' | 'desktop';

/**
 * Tile shape and screen-share split per viewport. `maxRatio` is the tallest a tile may become
 * (height / width): the video fills it with `object-fit: cover`, so a tile taller than the landscape
 * camera crops its sides, and the tile's height is what picks the simulcast layer every viewer pulls.
 *
 * @internal
 */
export const VIEWPORT_LAYOUT_PROFILES: Record<ViewportProfile, LayoutProfile> = {
	mobilePortrait: {
		maxRatio: 5 / 4,
		minRatio: 4 / 5,
		bigMaxRatio: 5 / 4,
		bigMinRatio: 3 / 4,
		bigPercentage: 0.85,
		minBigPercentage: 0.7
	},
	mobileLandscape: {
		maxRatio: 16 / 9,
		minRatio: 3 / 4,
		bigMaxRatio: 16 / 9,
		bigMinRatio: 4 / 3,
		bigPercentage: 0.82,
		minBigPercentage: 0.65
	},
	tabletPortrait: {
		maxRatio: 4 / 3,
		minRatio: 3 / 5,
		bigMaxRatio: 4 / 3,
		bigMinRatio: 9 / 16,
		bigPercentage: 0.83,
		minBigPercentage: 0.6
	},
	tabletLandscape: {
		maxRatio: 3 / 4,
		minRatio: 2 / 3,
		bigMaxRatio: 16 / 9,
		bigMinRatio: 9 / 16,
		bigPercentage: 0.81,
		minBigPercentage: 0.55
	},
	desktop: {
		maxRatio: 3 / 4,
		minRatio: 9 / 16,
		bigMaxRatio: 16 / 9,
		bigMinRatio: 9 / 16,
		bigPercentage: 0.8,
		minBigPercentage: 0.5
	}
};
