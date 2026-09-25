import { LayoutCalculator } from './layout-calculator.model';
import { LayoutDimensionsCache } from './layout-dimensions-cache.model';
import { ExtendedLayoutOptions, LayoutAlignment, LayoutBox } from './layout-types.model';

/** Boxes are floored to whole pixels row by row, so a clamp can be met with sub-pixel slack. */
const PIXEL_TOLERANCE = 0.01;

/** Height / width of a landscape shared screen. */
const SCREEN_RATIO = 1080 / 1920;

const cameras = (count: number): boolean[] => Array.from({ length: count }, () => false);

const optionsWith = (overrides: Partial<ExtendedLayoutOptions> = {}): ExtendedLayoutOptions => ({
	maxRatio: 3 / 4,
	minRatio: 9 / 16,
	bigClass: 'OV_big',
	ignoredClass: 'OV_ignored',
	bigPercentage: 0.8,
	minBigPercentage: 0.5,
	bigMaxRatio: 16 / 9,
	bigMinRatio: 9 / 16,
	bigFirst: true,
	alignItems: LayoutAlignment.CENTER,
	bigAlignItems: LayoutAlignment.CENTER,
	maxWidth: Infinity,
	maxHeight: Infinity,
	stripMaxSize: Infinity,
	bigMaxWidth: Infinity,
	bigMaxHeight: Infinity,
	containerWidth: 1280,
	containerHeight: 650,
	...overrides
});

const ratioOf = (box: LayoutBox): number => box.height / box.width;

const rowsOf = (boxes: LayoutBox[]): LayoutBox[][] => {
	const rows = new Map<number, LayoutBox[]>();

	for (const box of boxes) {
		const top = Math.round(box.top);
		rows.set(top, [...(rows.get(top) ?? []), box]);
	}

	return [...rows.entries()].sort(([a], [b]) => a - b).map(([, row]) => row);
};

const overlap = (a: LayoutBox, b: LayoutBox): boolean => {
	const horizontal = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
	const vertical = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);

	return horizontal > PIXEL_TOLERANCE && vertical > PIXEL_TOLERANCE;
};

describe('LayoutCalculator', () => {
	let calculator: LayoutCalculator;

	beforeEach(() => {
		calculator = new LayoutCalculator(new LayoutDimensionsCache());
	});

	const boxesFor = (count: number, overrides: Partial<ExtendedLayoutOptions> = {}): LayoutBox[] =>
		calculator.calculateLayout(optionsWith(overrides), cameras(count), SCREEN_RATIO).boxes;

	describe('tile shape', () => {
		it('never makes a tile taller than maxRatio', () => {
			for (let count = 1; count <= 12; count++) {
				for (const box of boxesFor(count, { maxRatio: 3 / 4 })) {
					expect(ratioOf(box)).toBeLessThanOrEqual(3 / 4 + PIXEL_TOLERANCE);
				}
			}
		});

		it('never makes a tile wider than minRatio', () => {
			for (let count = 1; count <= 12; count++) {
				for (const box of boxesFor(count, { minRatio: 9 / 16 })) {
					expect(ratioOf(box)).toBeGreaterThanOrEqual(9 / 16 - PIXEL_TOLERANCE);
				}
			}
		});

		it('clamps the tile to maxRatio instead of filling a narrow column', () => {
			const [tall] = boxesFor(3, { maxRatio: 16 / 9, containerWidth: 1280, containerHeight: 650 });
			const [capped] = boxesFor(3, { maxRatio: 3 / 4, containerWidth: 1280, containerHeight: 650 });

			expect(ratioOf(tall)).toBeGreaterThan(1);
			expect(ratioOf(capped)).toBeLessThanOrEqual(3 / 4 + PIXEL_TOLERANCE);
		});

		it('gives the tiles of a row the same size', () => {
			for (let count = 1; count <= 12; count++) {
				for (const row of rowsOf(boxesFor(count))) {
					for (const box of row) {
						expect(box.width).toBeCloseTo(row[0].width, 5);
						expect(box.height).toBeCloseTo(row[0].height, 5);
					}
				}
			}
		});

		it('gives a short last row the same tile size as the rest', () => {
			for (let count = 1; count <= 12; count++) {
				const boxes = boxesFor(count);
				const [first] = boxes;

				for (const box of boxes) {
					expect(box.width).toBeCloseTo(first.width, 5);
					expect(box.height).toBeCloseTo(first.height, 5);
				}
			}
		});

		it('centres a short last row instead of stretching it', () => {
			const rows = rowsOf(boxesFor(5));
			const [full, short] = rows;
			const centreOf = (row: LayoutBox[]) =>
				(Math.min(...row.map((box) => box.left)) + Math.max(...row.map((box) => box.left + box.width))) / 2;

			expect(rows.length).toBe(2);
			expect(short.length).toBeLessThan(full.length);
			expect(centreOf(short)).toBeCloseTo(centreOf(full), 0);
		});
	});

	describe('placement', () => {
		const containers = [
			{ containerWidth: 1280, containerHeight: 650 },
			{ containerWidth: 1024, containerHeight: 646 },
			{ containerWidth: 768, containerHeight: 902 },
			{ containerWidth: 390, containerHeight: 730 }
		];

		it('keeps every tile inside the container', () => {
			for (const container of containers) {
				for (let count = 1; count <= 12; count++) {
					for (const box of boxesFor(count, container)) {
						expect(box.left).toBeGreaterThanOrEqual(-PIXEL_TOLERANCE);
						expect(box.top).toBeGreaterThanOrEqual(-PIXEL_TOLERANCE);
						expect(box.left + box.width).toBeLessThanOrEqual(container.containerWidth + PIXEL_TOLERANCE);
						expect(box.top + box.height).toBeLessThanOrEqual(container.containerHeight + PIXEL_TOLERANCE);
					}
				}
			}
		});

		it('never overlaps two tiles', () => {
			for (const container of containers) {
				for (let count = 1; count <= 12; count++) {
					const boxes = boxesFor(count, container);

					for (let i = 0; i < boxes.length; i++) {
						for (let j = i + 1; j < boxes.length; j++) {
							expect(overlap(boxes[i], boxes[j])).toBe(false);
						}
					}
				}
			}
		});

		it('breaks a row rather than shrinking tiles past maxRatio', () => {
			const boxes = boxesFor(3, { maxRatio: 3 / 4, containerWidth: 1280, containerHeight: 650 });
			const rows = new Set(boxes.map((box) => Math.round(box.top)));

			expect(rows.size).toBe(2);
		});

		it('returns the boxes in the order the elements were given', () => {
			const { boxes, areas } = calculator.calculateLayout(optionsWith(), [false, true, false], SCREEN_RATIO);

			expect(boxes.length).toBe(3);
			expect(areas.big).not.toBeNull();
			expect(boxes[1].width).toBeGreaterThan(boxes[0].width);
			expect(boxes[0].width).toBeCloseTo(boxes[2].width, 5);
		});
	});

	describe('big element', () => {
		const withScreenShare = (cameraCount: number, overrides: Partial<ExtendedLayoutOptions> = {}) => {
			const { boxes, areas } = calculator.calculateLayout(
				optionsWith(overrides),
				[true, ...cameras(cameraCount)],
				SCREEN_RATIO
			);

			return { big: boxes[0], others: boxes.slice(1), band: areas.normal! };
		};

		it('sizes the shared screen with the big ratios, not the tile cap', () => {
			const { big } = withScreenShare(3, { maxRatio: 3 / 4, bigMaxRatio: 16 / 9, bigMinRatio: 9 / 16 });

			expect(ratioOf(big)).toBeGreaterThanOrEqual(9 / 16 - PIXEL_TOLERANCE);
			expect(ratioOf(big)).toBeLessThanOrEqual(16 / 9 + PIXEL_TOLERANCE);
		});

		it('caps the strip on the axis it takes its room from', () => {
			const beside = withScreenShare(3, { stripMaxSize: 220, containerWidth: 1856, containerHeight: 940 });
			const under = withScreenShare(3, { stripMaxSize: 100, containerWidth: 768, containerHeight: 902 });

			expect(beside.band.width).toBeCloseTo(220, 0);
			expect(beside.band.height).toBeCloseTo(940, 0);
			expect(under.band.height).toBeCloseTo(100, 0);
			expect(under.band.width).toBeCloseTo(768, 0);
		});

		it('keeps no room the big element cannot fill', () => {
			// A wide container the big element cannot span: its ratio clamp stops it well short, and
			// what it leaves belongs to the strip, not to a margin between the two.
			const { big, band } = withScreenShare(3, {
				stripMaxSize: 220,
				containerWidth: 1900,
				containerHeight: 815
			});

			expect(Math.abs(big.width - 815 / (9 / 16))).toBeLessThanOrEqual(2);
			expect(Math.abs(band.width - (1900 - big.width))).toBeLessThanOrEqual(2);
			expect(band.width).toBeGreaterThan(220);
		});

		it('never breaks the ratio clamp to honour a size cap', () => {
			const { others } = withScreenShare(3, {
				maxWidth: 220,
				containerWidth: 1900,
				containerHeight: 815
			});

			for (const box of others) {
				expect(ratioOf(box)).toBeLessThanOrEqual(3 / 4 + PIXEL_TOLERANCE);
				expect(box.width).toBeLessThanOrEqual(220 + PIXEL_TOLERANCE);
			}
		});

		it('leaves the other tiles a band they fill', () => {
			const { others, band } = withScreenShare(3, { containerWidth: 768, containerHeight: 902 });

			for (const box of others) {
				expect(band.height - box.height).toBeLessThanOrEqual(2);
			}
		});

		it('measures that band with the caps the other tiles are laid out with', () => {
			const { others, band } = withScreenShare(3, {
				containerWidth: 768,
				containerHeight: 902,
				maxHeight: 100
			});

			expect(band.height).toBeCloseTo(100, 0);

			for (const box of others) {
				expect(box.height).toBe(100);
			}
		});

		it('gives the shared screen most of the container', () => {
			const { big, others } = withScreenShare(3);
			const containerArea = 1280 * 650;

			expect((big.width * big.height) / containerArea).toBeGreaterThan(0.5);

			for (const box of others) {
				expect(box.width * box.height).toBeLessThan(big.width * big.height);
			}
		});
	});

	describe('strip cap', () => {
		it('leaves a grid without a big element alone', () => {
			const capped = boxesFor(3, { stripMaxSize: 220 });
			const uncapped = boxesFor(3);

			expect(capped[0].width).toBeCloseTo(uncapped[0].width, 5);
			expect(capped[0].width).toBeGreaterThan(220);
		});
	});

	describe('dimensions cache', () => {
		it('returns the same result for a repeated request', () => {
			const cache = new LayoutDimensionsCache();
			const cached = new LayoutCalculator(cache);
			const first = cached.getBestDimensions(9 / 16, 3 / 4, 1280, 650, 3, Infinity, Infinity);
			const second = cached.getBestDimensions(9 / 16, 3 / 4, 1280, 650, 3, Infinity, Infinity);

			expect(second).toBe(first);
		});

		it('does not reuse a result across different ratios', () => {
			const cache = new LayoutDimensionsCache();
			const cached = new LayoutCalculator(cache);
			const capped = cached.getBestDimensions(9 / 16, 3 / 4, 1280, 650, 3, Infinity, Infinity);
			const uncapped = cached.getBestDimensions(9 / 16, 16 / 9, 1280, 650, 3, Infinity, Infinity);

			expect(uncapped.targetHeight).not.toBe(capped.targetHeight);
		});
	});
});
