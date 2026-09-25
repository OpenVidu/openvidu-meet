import { LayoutCalculator } from './layout-calculator.model';
import { LayoutDimensionsCache } from './layout-dimensions-cache.model';
import {
	LAYOUT_CONSTANTS,
	LayoutAlignment,
	LayoutBox,
	LayoutClass,
	OpenViduLayout,
	OpenViduLayoutOptions,
	VIEWPORT_LAYOUT_PROFILES
} from './layout.model';

const OPTIONS: OpenViduLayoutOptions = {
	...VIEWPORT_LAYOUT_PROFILES.desktop,
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

const CONTAINER = { width: 1000, height: 500 };

/**
 * Where `count` elements, none of them big, belong in the order they are in the container: the box the
 * calculator gives each one, less the margin the layout leaves around it.
 */
const expectedBoxes = (count: number): LayoutBox[] => {
	const margin = CONTAINER.width * LAYOUT_CONSTANTS.ELEMENT_MARGIN;
	const { boxes } = new LayoutCalculator(new LayoutDimensionsCache()).calculateLayout(
		{ ...OPTIONS, containerWidth: CONTAINER.width, containerHeight: CONTAINER.height },
		Array.from({ length: count }, () => false),
		LAYOUT_CONSTANTS.DEFAULT_VIDEO_HEIGHT / LAYOUT_CONSTANTS.DEFAULT_VIDEO_WIDTH
	);

	return boxes.map(({ left, top, width, height }) => ({
		left: left + margin,
		top: top + margin,
		width: width - 2 * margin,
		height: height - 2 * margin
	}));
};

/** Where the element is painted, relative to the container. */
const paintedBox = (element: HTMLElement, container: HTMLElement): LayoutBox => {
	const box = element.getBoundingClientRect();
	const origin = container.getBoundingClientRect();
	return { left: box.left - origin.left, top: box.top - origin.top, width: box.width, height: box.height };
};

/** The browser keeps boxes in 1/64 px units, so compare to a tenth of a pixel. */
const expectPaintedOn = (tiles: HTMLElement[], container: HTMLElement, boxes: LayoutBox[]) => {
	expect(tiles.length).toBe(boxes.length);
	tiles.forEach((tile, index) => {
		const painted = paintedBox(tile, container);

		for (const side of ['left', 'top', 'width', 'height'] as const) {
			expect(painted[side]).withContext(`tile ${index} ${side}`).toBeCloseTo(boxes[index][side], 1);
		}
	});
};

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

describe('OpenViduLayout', () => {
	let layout: OpenViduLayout;
	let container: HTMLElement;

	/** A tile shaped like the grid's, with its padding inside the box it is given. */
	const addTile = (className = ''): HTMLElement => {
		const tile = document.createElement('div');
		tile.className = className;
		tile.style.boxSizing = 'border-box';
		tile.style.padding = '4px';
		return container.appendChild(tile);
	};

	beforeEach(() => {
		layout = new OpenViduLayout();
		container = document.createElement('div');
		container.id = 'layout-under-test';
		container.style.position = 'relative';
		container.style.width = `${CONTAINER.width}px`;
		container.style.height = `${CONTAINER.height}px`;
		document.body.appendChild(container);
	});

	afterEach(() => {
		layout.destroy();
		container.remove();
	});

	it('places every tile on its box within the animation frame the layout runs in', async () => {
		const tiles = [addTile(), addTile(), addTile()];

		layout.updateLayout(container, OPTIONS);
		await nextFrame();

		expectPaintedOn(tiles, container, expectedBoxes(3));
	});

	it('leaves floating and ignored elements where they are', async () => {
		const floating = addTile(LayoutClass.FLOATING_ELEMENT);
		const ignored = addTile(LayoutClass.IGNORED_ELEMENT);
		const tiles = [addTile(), addTile()];
		floating.style.width = ignored.style.width = '123px';

		layout.updateLayout(container, OPTIONS);
		await waitFor(() => tiles.every((tile) => tile.style.width !== ''));

		expectPaintedOn(tiles, container, expectedBoxes(2));
		expect([floating.style.width, ignored.style.width]).toEqual(['123px', '123px']);
		expect([floating.style.left, ignored.style.left]).toEqual(['', '']);
	});

	it('reads no style from the tiles it positions', async () => {
		const tiles = [addTile(), addTile(), addTile()];
		const readStyle = spyOn(window, 'getComputedStyle').and.callThrough();

		layout.updateLayout(container, OPTIONS);
		await waitFor(() => tiles.every((tile) => tile.style.width !== ''));

		const readTiles = readStyle.calls.allArgs().filter(([element]) => tiles.includes(element as HTMLElement));
		expect(readTiles.length).toBe(0);
	});

	describe('with a big element', () => {
		const readVideos: number[] = [];

		/** A tile holding a video of the given size, which records every time its size is read. */
		const addVideoTile = (width: number, height: number, className = ''): HTMLElement => {
			const tile = addTile(className);
			const video = tile.appendChild(document.createElement('video'));
			const index = container.children.length - 1;
			const read = (value: number) => () => (readVideos.push(index), value);
			Object.defineProperty(video, 'videoWidth', { get: read(width) });
			Object.defineProperty(video, 'videoHeight', { get: read(height) });
			return tile;
		};

		const placeWhenDone = async (tiles: HTMLElement[]) => {
			layout.updateLayout(container, OPTIONS);
			await waitFor(() => tiles.every((tile) => tile.style.width !== ''));
			return tiles.map((tile) => paintedBox(tile, container));
		};

		beforeEach(() => (readVideos.length = 0));

		it('reads the video size of the first big element only', async () => {
			await placeWhenDone([
				addVideoTile(1280, 720),
				addVideoTile(1920, 1080, LayoutClass.BIG_ELEMENT),
				addVideoTile(1280, 720, LayoutClass.BIG_ELEMENT),
				addVideoTile(1280, 720)
			]);

			expect(new Set(readVideos)).toEqual(new Set([1]));
		});

		it('lays the others below it when its video is wider than the container, beside it otherwise', async () => {
			// The other tiles hold portrait videos and one comes first, so the shape can only come from the
			// big one's video.
			const [firstWide, wide, lastWide] = await placeWhenDone([
				addVideoTile(480, 1000),
				addVideoTile(1920, 800, LayoutClass.BIG_ELEMENT),
				addVideoTile(480, 1000)
			]);
			expect([firstWide, lastWide].every((tile) => tile.top >= wide.top + wide.height - 1)).toBeTrue();

			container.replaceChildren();
			const [firstScreen, screen, lastScreen] = await placeWhenDone([
				addVideoTile(480, 1000),
				addVideoTile(1280, 720, LayoutClass.BIG_ELEMENT),
				addVideoTile(480, 1000)
			]);
			expect([firstScreen, lastScreen].every((tile) => tile.left >= screen.left + screen.width - 1)).toBeTrue();
		});
	});
});

/**
 * The suite runs zoneless, so there is no `fakeAsync`/`tick`: poll instead of guessing a delay.
 */
async function waitFor(condition: () => boolean, timeoutMs = 2000): Promise<void> {
	const start = performance.now();

	while (!condition()) {
		if (performance.now() - start > timeoutMs) {
			throw new Error('Timed out waiting for condition');
		}

		await new Promise((resolve) => setTimeout(resolve, 20));
	}
}
