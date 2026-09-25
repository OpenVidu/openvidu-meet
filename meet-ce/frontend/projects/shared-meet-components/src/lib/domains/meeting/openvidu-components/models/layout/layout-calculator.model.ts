import { LayoutDimensionsCache } from './layout-dimensions-cache.model';
import {
	BestDimensions,
	BigFirstOption,
	ExtendedLayoutOptions,
	LAYOUT_CONSTANTS,
	LayoutAlignment,
	LayoutBox,
	LayoutCalculationResult
} from './layout-types.model';

interface BigAreaPlacement {
	bigWidth: number;
	bigHeight: number;
	offsetTop: number;
	offsetLeft: number;
	bigOffsetTop: number;
	bigOffsetLeft: number;
	showBigFirst: boolean | 'column' | 'row';
}

/**
 * Pure calculation logic for layout positioning.
 * Contains all mathematical algorithms for element positioning without DOM manipulation.
 *
 * @internal
 */
export class LayoutCalculator {
	constructor(private dimensionsCache: LayoutDimensionsCache) {}

	/**
	 * Boxes of the elements in container order. `isBig[i]` puts element `i` in the big area, and
	 * `bigVideoRatio`, the height / width of the first big element's video, decides whether the others
	 * go below it or beside it.
	 */
	calculateLayout(opts: ExtendedLayoutOptions, isBig: boolean[], bigVideoRatio: number): LayoutCalculationResult {
		const {
			maxRatio = LAYOUT_CONSTANTS.DEFAULT_MAX_RATIO,
			minRatio = LAYOUT_CONSTANTS.DEFAULT_MIN_RATIO,
			bigPercentage = LAYOUT_CONSTANTS.DEFAULT_BIG_PERCENTAGE,
			minBigPercentage = 0,
			bigMaxRatio = LAYOUT_CONSTANTS.DEFAULT_MAX_RATIO,
			bigMinRatio = LAYOUT_CONSTANTS.DEFAULT_MIN_RATIO,
			bigFirst = true,
			containerWidth = LAYOUT_CONSTANTS.DEFAULT_VIDEO_WIDTH,
			containerHeight = LAYOUT_CONSTANTS.DEFAULT_VIDEO_HEIGHT,
			alignItems = LayoutAlignment.CENTER,
			bigAlignItems = LayoutAlignment.CENTER,
			maxWidth = Infinity,
			maxHeight = Infinity,
			stripMaxSize = Infinity,
			bigMaxWidth = Infinity,
			bigMaxHeight = Infinity
		} = opts;

		const bigCount = isBig.filter(Boolean).length;
		const othersCount = isBig.length - bigCount;

		const areas: LayoutCalculationResult['areas'] = { big: null, normal: null };
		let bigBoxes: LayoutBox[] = [];
		let normalBoxes: LayoutBox[] = [];

		const hasBig = bigCount > 0;
		const hasOthers = othersCount > 0;

		if (hasBig && hasOthers) {
			const isTall = containerHeight / containerWidth > bigVideoRatio;
			const placement = this.computeBigAreaPlacement({
				isTall,
				containerWidth,
				containerHeight,
				bigPercentage,
				minBigPercentage,
				bigMinRatio,
				bigMaxRatio,
				bigMaxWidth,
				bigMaxHeight,
				minRatio,
				maxRatio,
				maxWidth,
				maxHeight,
				stripMaxSize,
				bigFirst,
				bigCount,
				othersCount
			});

			const { bigWidth, bigHeight, offsetTop, offsetLeft, bigOffsetTop, bigOffsetLeft, showBigFirst } = placement;

			if (showBigFirst) {
				areas.big = { top: 0, left: 0, width: bigWidth, height: bigHeight };
				areas.normal = {
					top: offsetTop,
					left: offsetLeft,
					width: containerWidth - offsetLeft,
					height: containerHeight - offsetTop
				};
			} else {
				areas.big = { left: bigOffsetLeft, top: bigOffsetTop, width: bigWidth, height: bigHeight };
				areas.normal = {
					top: 0,
					left: 0,
					width: containerWidth - offsetLeft,
					height: containerHeight - offsetTop
				};
			}
		} else if (hasBig) {
			areas.big = { top: 0, left: 0, width: containerWidth, height: containerHeight };
		} else if (hasOthers) {
			areas.normal = { top: 0, left: 0, width: containerWidth, height: containerHeight };
		}

		if (areas.big) {
			bigBoxes = this.calculateBoxesForArea(
				{
					containerWidth: areas.big.width,
					containerHeight: areas.big.height,
					offsetLeft: areas.big.left,
					offsetTop: areas.big.top,
					minRatio: bigMinRatio,
					maxRatio: bigMaxRatio,
					alignItems: bigAlignItems,
					maxWidth: bigMaxWidth,
					maxHeight: bigMaxHeight
				},
				bigCount
			);
		}

		if (areas.normal) {
			normalBoxes = this.calculateBoxesForArea(
				{
					containerWidth: areas.normal.width,
					containerHeight: areas.normal.height,
					offsetLeft: areas.normal.left,
					offsetTop: areas.normal.top,
					minRatio,
					maxRatio,
					alignItems,
					maxWidth,
					maxHeight
				},
				othersCount
			);
		}

		const boxes = this.inContainerOrder(isBig, bigBoxes, normalBoxes);
		return { boxes, areas };
	}

	getBestDimensions(
		minRatio: number,
		maxRatio: number,
		width: number,
		height: number,
		count: number,
		maxWidth: number,
		maxHeight: number
	): BestDimensions {
		const cacheKey = LayoutDimensionsCache.generateKey(
			minRatio,
			maxRatio,
			width,
			height,
			count,
			maxWidth,
			maxHeight
		);
		const cached = this.dimensionsCache.get(cacheKey);

		if (cached) {
			return cached;
		}

		let maxArea: number | undefined;
		let targetCols = 1;
		let targetRows = 1;
		let targetHeight = 0;
		let targetWidth = 0;

		// Iterate through every row/column combination and pick the one with the least whitespace.
		for (let cols = 1; cols <= count; cols++) {
			const rows = Math.ceil(count / cols);

			let tHeight = Math.floor(height / rows);
			let tWidth = Math.floor(width / cols);

			let tRatio = tHeight / tWidth;

			if (tRatio > maxRatio) {
				tRatio = maxRatio;
				tHeight = tWidth * tRatio;
			} else if (tRatio < minRatio) {
				tRatio = minRatio;
				tWidth = tHeight / tRatio;
			}

			tWidth = Math.min(maxWidth, tWidth);
			tHeight = Math.min(maxHeight, tHeight);

			// A size cap can break the ratio the clamp above just agreed on. Shrink the other side
			// back into range: growing it would break the cap instead.
			if (tHeight / tWidth > maxRatio) {
				tHeight = tWidth * maxRatio;
			} else if (tHeight / tWidth < minRatio) {
				tWidth = tHeight / minRatio;
			}

			const area = tWidth * tHeight * count;

			// Accept if first iteration, strictly larger area, or same area with fewer stragglers in the last row.
			const isBetter =
				maxArea === undefined ||
				area > maxArea ||
				(area === maxArea && count % (cols * rows) <= count % (targetRows * targetCols));

			if (isBetter) {
				maxArea = area;
				targetHeight = tHeight;
				targetWidth = tWidth;
				targetCols = cols;
				targetRows = rows;
			}
		}

		const result: BestDimensions = {
			maxArea: maxArea ?? 0,
			targetCols,
			targetRows,
			targetHeight,
			targetWidth,
			ratio: targetWidth > 0 ? targetHeight / targetWidth : 0
		};

		this.dimensionsCache.set(cacheKey, result);
		return result;
	}

	private calculateBoxesForArea(
		opts: Partial<ExtendedLayoutOptions & { offsetLeft: number; offsetTop: number }>,
		count: number
	): LayoutBox[] {
		const {
			maxRatio = LAYOUT_CONSTANTS.DEFAULT_MAX_RATIO,
			minRatio = LAYOUT_CONSTANTS.DEFAULT_MIN_RATIO,
			containerWidth = LAYOUT_CONSTANTS.DEFAULT_VIDEO_WIDTH,
			containerHeight = LAYOUT_CONSTANTS.DEFAULT_VIDEO_HEIGHT,
			offsetLeft = 0,
			offsetTop = 0,
			alignItems = LayoutAlignment.CENTER,
			maxWidth = Infinity,
			maxHeight = Infinity
		} = opts;

		const { targetCols, targetRows, targetWidth, targetHeight } = this.getBestDimensions(
			minRatio,
			maxRatio,
			containerWidth,
			containerHeight,
			count,
			maxWidth,
			maxHeight
		);

		// Every element keeps the same size: a last row with fewer of them is centred, not grown,
		// so a straggler does not read as the featured one.
		const top = offsetTop + this.alignmentOffset(alignItems, containerHeight, targetRows * targetHeight);

		return Array.from({ length: count }, (_, index) => {
			const row = Math.floor(index / targetCols);
			const inRow = Math.min(targetCols, count - row * targetCols);
			const left = offsetLeft + this.alignmentOffset(alignItems, containerWidth, inRow * targetWidth);

			return {
				left: left + (index % targetCols) * targetWidth,
				top: top + row * targetHeight,
				width: targetWidth,
				height: targetHeight
			};
		});
	}

	/**
	 * Compute the big area's footprint and the resulting offsets for the secondary area, unifying
	 * the previously duplicated tall-vs-wide branches behind a single `isTall` flag.
	 */
	private computeBigAreaPlacement(opts: {
		isTall: boolean;
		containerWidth: number;
		containerHeight: number;
		bigPercentage: number;
		minBigPercentage: number;
		bigMinRatio: number;
		bigMaxRatio: number;
		bigMaxWidth: number;
		bigMaxHeight: number;
		minRatio: number;
		maxRatio: number;
		maxWidth: number;
		maxHeight: number;
		stripMaxSize: number;
		bigFirst: BigFirstOption;
		bigCount: number;
		othersCount: number;
	}): BigAreaPlacement {
		const {
			isTall,
			containerWidth,
			containerHeight,
			bigPercentage,
			minBigPercentage,
			bigMinRatio,
			bigMaxRatio,
			bigMaxWidth,
			bigMaxHeight,
			minRatio,
			maxRatio,
			maxWidth,
			maxHeight,
			stripMaxSize,
			bigFirst,
			bigCount,
			othersCount
		} = opts;

		let bigWidth = isTall ? containerWidth : Math.floor(containerWidth * bigPercentage);
		let bigHeight = isTall ? Math.floor(containerHeight * bigPercentage) : containerHeight;

		// The most the big elements could ever fill, ratio clamps included. Any area beyond this is
		// a margin around them that no element can use, so it belongs to the others instead.
		const fillable = this.getBestDimensions(
			bigMinRatio,
			bigMaxRatio,
			containerWidth,
			containerHeight,
			bigCount,
			bigMaxWidth,
			bigMaxHeight
		);

		if (minBigPercentage > 0) {
			const bigDimensions = this.getBestDimensions(
				bigMinRatio,
				bigMaxRatio,
				bigWidth,
				bigHeight,
				bigCount,
				bigMaxWidth,
				bigMaxHeight
			);

			if (isTall) {
				bigHeight = Math.max(
					containerHeight * minBigPercentage,
					Math.min(bigHeight, bigDimensions.targetHeight * bigDimensions.targetRows)
				);
				const otherDimensions = this.getBestDimensions(
					minRatio,
					maxRatio,
					containerWidth,
					containerHeight - bigHeight,
					othersCount,
					maxWidth,
					maxHeight
				);
				bigHeight = Math.max(
					bigHeight,
					containerHeight - otherDimensions.targetRows * otherDimensions.targetHeight
				);
			} else {
				bigWidth = Math.max(
					containerWidth * minBigPercentage,
					Math.min(bigWidth, bigDimensions.targetWidth * bigDimensions.targetCols)
				);
				const otherDimensions = this.getBestDimensions(
					minRatio,
					maxRatio,
					containerWidth - bigWidth,
					containerHeight,
					othersCount,
					maxWidth,
					maxHeight
				);
				bigWidth = Math.max(
					bigWidth,
					containerWidth - otherDimensions.targetCols * otherDimensions.targetWidth
				);
			}
		}

		// The strip of others never takes more than `stripMaxSize` from the big element, and the big
		// element never keeps more than it can fill: what neither can use stays around them.
		if (isTall) {
			bigHeight = Math.max(bigHeight, containerHeight - stripMaxSize);
			bigHeight = Math.min(bigHeight, fillable.targetHeight * fillable.targetRows);
		} else {
			bigWidth = Math.max(bigWidth, containerWidth - stripMaxSize);
			bigWidth = Math.min(bigWidth, fillable.targetWidth * fillable.targetCols);
		}

		const offsetTop = isTall ? bigHeight : 0;
		const offsetLeft = isTall ? 0 : bigWidth;
		const bigOffsetTop = isTall ? containerHeight - offsetTop : 0;
		const bigOffsetLeft = isTall ? 0 : containerWidth - offsetLeft;

		// Tall orientation lays rows; wide orientation lays columns. `bigFirst === 'row'` means
		// "big takes a row" — that only places big first when we're stacked vertically (tall).
		let showBigFirst: BigAreaPlacement['showBigFirst'] = bigFirst;

		if (bigFirst === 'column') {
			showBigFirst = !isTall;
		} else if (bigFirst === 'row') {
			showBigFirst = isTall;
		}

		return { bigWidth, bigHeight, offsetTop, offsetLeft, bigOffsetTop, bigOffsetLeft, showBigFirst };
	}

	private inContainerOrder(isBig: boolean[], bigBoxes: LayoutBox[], normalBoxes: LayoutBox[]): LayoutBox[] {
		let nextBig = 0;
		let nextNormal = 0;

		return isBig.map((big) => (big ? bigBoxes[nextBig++] : normalBoxes[nextNormal++]));
	}

	private alignmentOffset(alignment: LayoutAlignment, container: number, content: number): number {
		switch (alignment) {
			case LayoutAlignment.START:
				return 0;
			case LayoutAlignment.END:
				return container - content;
			case LayoutAlignment.CENTER:
			default:
				return (container - content) / 2;
		}
	}
}
